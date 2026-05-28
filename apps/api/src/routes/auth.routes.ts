import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { prisma } from '@erp/db';
import { loginSchema, changePasswordSchema } from '@erp/types';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { AppError, UnauthorizedError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const authRouter: Router = Router();

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_DAYS = 7;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const IS_PROD = process.env.NODE_ENV === 'production';

/** Cookie options that work for both same-origin (dev) and cross-origin (prod) */
function refreshCookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? ('none' as const) : ('strict' as const),
    maxAge: maxAge ?? REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    path: '/api/v1/auth',
  };
}

// Per-IP rate limit on login: 10 attempts per 5 minutes
const loginRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again in 5 minutes.' },
  },
});

function generateAccessToken(user: { id: string; role: string; name: string }): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET not configured');
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name },
    secret,
    { expiresIn: ACCESS_TOKEN_EXPIRY },
  );
}

// ─── POST /auth/login ────────────────────────────────────────────

authRouter.post('/login', loginRateLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      res.status(401).json({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' },
      });
      return;
    }

    // Check lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      res.status(423).json({
        ok: false,
        error: {
          code: 'ACCOUNT_LOCKED',
          message: `Account locked. Try again after ${user.lockedUntil.toISOString()}`,
        },
      });
      return;
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      // Increment failed count
      const newCount = user.failedLoginCount + 1;
      const updateData: Record<string, unknown> = { failedLoginCount: newCount };

      if (newCount >= LOCKOUT_THRESHOLD) {
        updateData.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        logger.warn({ userId: user.id, email }, 'Account locked after %d failed attempts', newCount);
      }

      await prisma.user.update({ where: { id: user.id }, data: updateData });

      res.status(401).json({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' },
      });
      return;
    }

    // Successful login — reset failed count
    const refreshToken = randomBytes(32).toString('hex');
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        refreshTokenHash,
        lastLoginAt: new Date(),
      },
    });

    const accessToken = generateAccessToken({ id: user.id, role: user.role, name: user.name });

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', refreshToken, refreshCookieOptions());

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        entity: 'User',
        entityId: user.id,
        after: { email: user.email },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({
      ok: true,
      data: {
        accessToken,
        user: { id: user.id, name: user.name, role: user.role },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/refresh ──────────────────────────────────────────

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      res.status(401).json({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'No refresh token' },
      });
      return;
    }

    // Find user with a refresh token hash
    const users = await prisma.user.findMany({
      where: { isActive: true, refreshTokenHash: { not: null } },
      select: { id: true, name: true, role: true, refreshTokenHash: true },
    });

    let matchedUser: typeof users[0] | null = null;
    for (const user of users) {
      if (user.refreshTokenHash && await bcrypt.compare(token, user.refreshTokenHash)) {
        matchedUser = user;
        break;
      }
    }

    if (!matchedUser) {
      res.clearCookie('refreshToken', refreshCookieOptions(0));
      res.status(401).json({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' },
      });
      return;
    }

    // Rotate refresh token
    const newRefreshToken = randomBytes(32).toString('hex');
    const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);

    await prisma.user.update({
      where: { id: matchedUser.id },
      data: { refreshTokenHash: newRefreshTokenHash },
    });

    const accessToken = generateAccessToken({
      id: matchedUser.id,
      role: matchedUser.role,
      name: matchedUser.name,
    });

    res.cookie('refreshToken', newRefreshToken, refreshCookieOptions());

    res.json({
      ok: true,
      data: {
        accessToken,
        user: { id: matchedUser.id, name: matchedUser.name, role: matchedUser.role },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/logout ───────────────────────────────────────────

authRouter.post('/logout', authenticate, async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { refreshTokenHash: null },
    });

    res.clearCookie('refreshToken', refreshCookieOptions(0));

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'LOGOUT',
        entity: 'User',
        entityId: req.user!.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/change-password ──────────────────────────────────

authRouter.post('/change-password', authenticate, validate(changePasswordSchema), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      next(new UnauthorizedError());
      return;
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Current password is incorrect' },
      });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        refreshTokenHash: null, // Force re-login on other sessions
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_CHANGE',
        entity: 'User',
        entityId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({ ok: true, data: { message: 'Password changed successfully' } });
  } catch (err) {
    next(err);
  }
});

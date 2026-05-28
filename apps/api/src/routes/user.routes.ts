import { Router } from 'express';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { prisma } from '@erp/db';
import { createUserSchema, updateUserSchema } from '@erp/types';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { NotFoundError, ConflictError } from '../lib/errors.js';

export const userRouter: Router = Router();

// All user routes require auth
userRouter.use(authenticate);

// ─── POST /users — Create user (ADMIN) ──────────────────────────

userRouter.post('/', authorize('ADMIN'), validate(createUserSchema), async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      next(new ConflictError(`User with email '${email}' already exists`));
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role,
        createdById: req.user!.id,
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'USER_CREATE',
        entity: 'User',
        entityId: user.id,
        after: { name, email, role },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.status(201).json({ ok: true, data: user });
  } catch (err) {
    next(err);
  }
});

// ─── GET /users — List (ADMIN) ──────────────────────────────────

userRouter.get('/', authorize('ADMIN'), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true, name: true, email: true, role: true,
        isActive: true, lastLoginAt: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ ok: true, data: users });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /users/:id — Edit (ADMIN or self for name) ───────────

userRouter.patch('/:id', validate(updateUserSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // STAFF can only edit their own name
    if (req.user!.role === 'STAFF') {
      if (id !== req.user!.id || updates.role || updates.isActive !== undefined) {
        next(new ConflictError('STAFF can only update their own name'));
        return;
      }
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      next(new NotFoundError('User', id));
      return;
    }

    const before = { name: user.name, role: user.role, isActive: user.isActive };

    const updated = await prisma.user.update({
      where: { id },
      data: updates,
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'USER_UPDATE',
        entity: 'User',
        entityId: id,
        before,
        after: updates,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({ ok: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /users/:id — Deactivate (ADMIN) ─────────────────────

userRouter.delete('/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Cannot deactivate the last active ADMIN
    const activeAdmins = await prisma.user.count({
      where: { role: 'ADMIN', isActive: true },
    });
    const targetUser = await prisma.user.findUnique({ where: { id } });

    if (!targetUser) {
      next(new NotFoundError('User', id));
      return;
    }

    if (targetUser.role === 'ADMIN' && activeAdmins <= 1) {
      next(new ConflictError('Cannot deactivate the last active ADMIN'));
      return;
    }

    await prisma.user.update({
      where: { id },
      data: { isActive: false, refreshTokenHash: null },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'USER_DEACTIVATE',
        entity: 'User',
        entityId: id,
        before: { isActive: true },
        after: { isActive: false },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({ ok: true, data: { message: 'User deactivated' } });
  } catch (err) {
    next(err);
  }
});

// ─── POST /users/:id/reset-password — ADMIN only ─────────────

userRouter.post('/:id/reset-password', authorize('ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      next(new NotFoundError('User', id));
      return;
    }

    // Generate a temporary password: 12-char random hex + "!A1" to satisfy rules
    const tempPassword = randomBytes(6).toString('hex') + '!A1';
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        refreshTokenHash: null, // Invalidate all sessions
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'PASSWORD_RESET',
        entity: 'User',
        entityId: id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({ ok: true, data: { temporaryPassword: tempPassword } });
  } catch (err) {
    next(err);
  }
});

// ─── POST /users/:id/unlock — ADMIN clear lockout ────────────

userRouter.post('/:id/unlock', authorize('ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      next(new NotFoundError('User', id));
      return;
    }

    await prisma.user.update({
      where: { id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'USER_UPDATE',
        entity: 'User',
        entityId: id,
        before: { failedLoginCount: user.failedLoginCount, lockedUntil: user.lockedUntil },
        after: { failedLoginCount: 0, lockedUntil: null },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    res.json({ ok: true, data: { message: 'Account unlocked' } });
  } catch (err) {
    next(err);
  }
});

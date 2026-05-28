import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '@erp/db';
import { UnauthorizedError } from '../lib/errors.js';
import { cacheGet, cacheSet } from '../lib/cache.js';

export interface JwtPayload {
  sub: string;
  role: 'ADMIN' | 'STAFF';
  name: string;
  iat: number;
  exp: number;
}

interface CachedUserCheck {
  isActive: boolean;
  passwordChangedEpoch: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: 'ADMIN' | 'STAFF';
        name: string;
      };
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing or invalid authorization header'));
    return;
  }

  const token = authHeader.slice(7);

  try {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) throw new Error('JWT_ACCESS_SECRET not configured');

    const payload = jwt.verify(token, secret) as JwtPayload;

    // Check cache first to avoid DB round trip on every request
    const cacheKey = `auth-user:${payload.sub}`;
    const cached = cacheGet<CachedUserCheck>(cacheKey);

    if (cached) {
      if (!cached.isActive) {
        next(new UnauthorizedError('User account is inactive or not found'));
        return;
      }
      if (payload.iat < cached.passwordChangedEpoch) {
        next(new UnauthorizedError('Token invalidated by password change'));
        return;
      }
      req.user = { id: payload.sub, role: payload.role, name: payload.name };
      next();
      return;
    }

    // Cache miss — query DB and cache for 30s
    prisma.user
      .findUnique({ where: { id: payload.sub }, select: { isActive: true, passwordChangedAt: true } })
      .then((user) => {
        if (!user || !user.isActive) {
          cacheSet<CachedUserCheck>(cacheKey, { isActive: false, passwordChangedEpoch: 0 }, 30_000);
          next(new UnauthorizedError('User account is inactive or not found'));
          return;
        }

        const passwordChangedEpoch = Math.floor(user.passwordChangedAt.getTime() / 1000);
        cacheSet<CachedUserCheck>(cacheKey, { isActive: true, passwordChangedEpoch }, 30_000);

        if (payload.iat < passwordChangedEpoch) {
          next(new UnauthorizedError('Token invalidated by password change'));
          return;
        }

        req.user = {
          id: payload.sub,
          role: payload.role,
          name: payload.name,
        };
        next();
      })
      .catch(next);
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

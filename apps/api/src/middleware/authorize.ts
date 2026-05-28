import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../lib/errors.js';

export function authorize(...roles: Array<'ADMIN' | 'STAFF'>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new ForbiddenError());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}

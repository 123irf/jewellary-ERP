import { Router } from 'express';
import { prisma } from '@erp/db';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

export const auditLogRouter: Router = Router();

auditLogRouter.use(authenticate);
auditLogRouter.use(authorize('ADMIN'));

// ─── GET /audit-log — Paginated list (ADMIN) ────────────────

auditLogRouter.get('/', async (req, res, next) => {
  try {
    const {
      entity,
      entityId,
      userId,
      action,
      from,
      to,
      page = '1',
      pageSize = '50',
    } = req.query as Record<string, string | undefined>;

    const pageNum = Math.max(1, parseInt(page || '1', 10));
    const size = Math.min(100, Math.max(1, parseInt(pageSize || '50', 10)));

    const where: Record<string, unknown> = {};
    if (entity) where.entity = entity;
    if (entityId) where.entityId = entityId;
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * size,
        take: size,
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      ok: true,
      data: {
        rows,
        pagination: {
          page: pageNum,
          pageSize: size,
          total,
          totalPages: Math.ceil(total / size),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

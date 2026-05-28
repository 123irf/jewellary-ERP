import { Router } from 'express';
import { stockMovementQuerySchema } from '@erp/types';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { prisma } from '@erp/db';
import { runReconciliation } from '../services/reconciliation.service.js';

export const stockMovementRouter: Router = Router();

// All stock-movement routes require auth + ADMIN
stockMovementRouter.use(authenticate);
stockMovementRouter.use(authorize('ADMIN'));

// ─── GET / — Cross-product movement feed (ADMIN) ────────────────

stockMovementRouter.get(
  '/',
  validate(stockMovementQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const { from, to, type, userId, categoryId, page, pageSize } = req.query as any;

      const where: Record<string, unknown> = {};

      if (from || to) {
        where.createdAt = {};
        if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from);
        if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to);
      }
      if (type) where.type = type;
      if (userId) where.createdById = userId;
      if (categoryId) {
        where.product = { categoryId };
      }

      const [total, movements] = await Promise.all([
        prisma.stockMovement.count({ where: where as any }),
        prisma.stockMovement.findMany({
          where: where as any,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            product: {
              select: { id: true, name: true, sku: true, category: { select: { id: true, name: true } } },
            },
            createdBy: { select: { id: true, name: true } },
            sale: { select: { id: true, invoiceNumber: true } },
            vendorTransaction: {
              select: {
                id: true,
                referenceNo: true,
                vendor: { select: { id: true, name: true } },
              },
            },
          },
        }),
      ]);

      res.json({
        ok: true,
        data: {
          movements,
          pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /reconciliation — Health check (ADMIN) ─────────────────

stockMovementRouter.get('/reconciliation', async (_req, res, next) => {
  try {
    // Find products where currentStock != SUM(quantityDelta)
    const drifted = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        sku: string;
        currentStock: number;
        computedStock: bigint;
        drift: bigint;
      }>
    >`
      SELECT
        p."id",
        p."name",
        p."sku",
        p."currentStock",
        COALESCE(SUM(sm."quantityDelta"), 0)::bigint AS "computedStock",
        (COALESCE(SUM(sm."quantityDelta"), 0) - p."currentStock")::bigint AS "drift"
      FROM "Product" p
      LEFT JOIN "StockMovement" sm ON sm."productId" = p."id"
      WHERE p."isActive" = true
      GROUP BY p."id", p."name", p."sku", p."currentStock"
      HAVING p."currentStock" != COALESCE(SUM(sm."quantityDelta"), 0)
      ORDER BY ABS(COALESCE(SUM(sm."quantityDelta"), 0) - p."currentStock") DESC
    `;

    // Convert bigint to number for JSON serialization
    const items = drifted.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      currentStock: row.currentStock,
      computedStock: Number(row.computedStock),
      drift: Number(row.drift),
    }));

    res.json({
      ok: true,
      data: {
        healthy: items.length === 0,
        driftCount: items.length,
        items,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /reconciliation/run — Manual trigger (ADMIN) ──────────

stockMovementRouter.post('/reconciliation/run', async (req, res, next) => {
  try {
    const result = await runReconciliation(req.user!.id);
    res.json({ ok: true, data: result });
  } catch (err) {
    next(err);
  }
});

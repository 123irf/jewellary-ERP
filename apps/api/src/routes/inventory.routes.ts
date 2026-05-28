import { Router } from 'express';
import {
  createProductSchema,
  updateProductSchema,
  productListQuerySchema,
  createGoldRateSchema,
  pricePreviewSchema,
  stockAdjustmentSchema,
} from '@erp/types';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import {
  createProduct,
  getProductDetail,
  listProducts,
  updateProduct,
  softDeleteProduct,
  getLowStockProducts,
  setGoldRate,
  getGoldRateHistory,
} from '../services/inventory.service.js';
import { computeSellingPrice, getLatestGoldRate } from '../services/pricing.service.js';
import { recordMovement } from '../services/stockMovement.service.js';
import { prisma } from '@erp/db';
import { ValidationError } from '../lib/errors.js';
import { cacheResponse } from '../middleware/cacheResponse.js';
import { invalidatePrefix } from '../lib/cache.js';

export const inventoryRouter: Router = Router();

// All inventory routes require auth
inventoryRouter.use(authenticate);

// ─── POST /products — Create ─────────────────────────────────────

inventoryRouter.post(
  '/products',
  authorize('ADMIN', 'STAFF'),
  validate(createProductSchema),
  async (req, res, next) => {
    try {
      const product = await createProduct(req.body, req.user!.id);
      invalidatePrefix('products');
      res.status(201).json({ ok: true, data: product });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /products — List ────────────────────────────────────────

inventoryRouter.get(
  '/products',
  validate(productListQuerySchema, 'query'),
  cacheResponse('products', 30_000),
  async (req, res, next) => {
    try {
      const result = await listProducts(req.query as any);
      res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /low-stock — Low stock alert ────────────────────────────

inventoryRouter.get('/low-stock', cacheResponse('products', 30_000), async (_req, res, next) => {
  try {
    const products = await getLowStockProducts();
    res.json({ ok: true, data: products });
  } catch (err) {
    next(err);
  }
});

// ─── POST /products/preview-price — Live price calc ──────────────

inventoryRouter.post(
  '/products/preview-price',
  validate(pricePreviewSchema),
  async (req, res, next) => {
    try {
      const { grossWeight, stoneWeight, wastagePct, makingChargesPct, goldPurity, stoneRatePerCt } = req.body;

      const goldRate = await getLatestGoldRate(goldPurity);
      if (!goldRate) {
        res.json({
          ok: true,
          data: {
            sellingPrice: null,
            warning: `No gold rate set for ${goldPurity}. Set gold rate first.`,
          },
        });
        return;
      }

      const netWeight = grossWeight - stoneWeight;
      const breakdown = computeSellingPrice({
        netWeight,
        goldRate,
        wastagePct,
        makingChargesPct,
        stoneWeight,
        stoneRatePerCt: stoneRatePerCt ?? null,
      });

      res.json({
        ok: true,
        data: {
          netWeight: netWeight.toFixed(3),
          goldRate: breakdown.goldRate.toFixed(2),
          goldValue: breakdown.goldValue.toFixed(2),
          wastageCost: breakdown.wastageCost.toFixed(2),
          makingCost: breakdown.makingCost.toFixed(2),
          stoneCost: breakdown.stoneCost.toFixed(2),
          sellingPrice: breakdown.sellingPrice.toFixed(2),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /products/:id — Detail ──────────────────────────────────

inventoryRouter.get('/products/:id', async (req, res, next) => {
  try {
    const product = await getProductDetail(req.params.id);
    res.json({ ok: true, data: product });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /products/:id — Edit ──────────────────────────────────

inventoryRouter.patch(
  '/products/:id',
  authorize('ADMIN', 'STAFF'),
  validate(updateProductSchema),
  async (req, res, next) => {
    try {
      const product = await updateProduct(req.params.id, req.body, req.user!.id, req.user!.role);
      invalidatePrefix('products');
      res.json({ ok: true, data: product });
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /products/:id — Soft delete ──────────────────────────

inventoryRouter.delete(
  '/products/:id',
  authorize('ADMIN'),
  async (req, res, next) => {
    try {
      const result = await softDeleteProduct(req.params.id, req.user!.id);
      invalidatePrefix('products');
      res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /gold-rate — Set gold rate (ADMIN) ─────────────────────

inventoryRouter.post(
  '/gold-rate',
  authorize('ADMIN'),
  validate(createGoldRateSchema),
  async (req, res, next) => {
    try {
      const { purity, ratePerGm } = req.body;
      const rate = await setGoldRate(purity, ratePerGm, req.user!.id);
      invalidatePrefix('goldrate');
      res.status(201).json({ ok: true, data: rate });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /gold-rate — History ────────────────────────────────────

inventoryRouter.get('/gold-rate', cacheResponse('goldrate', 10_000), async (req, res, next) => {
  try {
    const purity = req.query.purity as string | undefined;
    const rates = await getGoldRateHistory(purity);
    res.json({ ok: true, data: rates });
  } catch (err) {
    next(err);
  }
});

// ─── POST /products/:id/adjust-stock — Manual adjustment (ADMIN) ─

inventoryRouter.post(
  '/products/:id/adjust-stock',
  authorize('ADMIN'),
  validate(stockAdjustmentSchema),
  async (req, res, next) => {
    try {
      const { type, quantity, reason } = req.body;
      const productId = req.params.id;
      const userId = req.user!.id;

      // Determine delta sign
      const delta = type === 'ADJUSTMENT_IN' ? quantity : -quantity;

      const movement = await prisma.$transaction(async (tx) => {
        const m = await recordMovement(tx, {
          productId,
          type,
          quantityDelta: delta,
          userId,
          notes: reason,
        });

        await tx.auditLog.create({
          data: {
            userId,
            action: 'STOCK_ADJUST',
            entity: 'Product',
            entityId: productId,
            after: { type, quantity, reason, stockAfter: m.stockAfter },
          },
        });

        return m;
      });

      invalidatePrefix('products');
      res.status(201).json({ ok: true, data: movement });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /products/:id/movements — Stock movement timeline ──────

inventoryRouter.get('/products/:id/movements', async (req, res, next) => {
  try {
    const { id } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize as string) || 50));
    const type = req.query.type as string | undefined;

    const where: Record<string, unknown> = { productId: id };
    if (type) where.type = type;

    const [total, movements] = await Promise.all([
      prisma.stockMovement.count({ where: where as any }),
      prisma.stockMovement.findMany({
        where: where as any,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
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
});

// ─── GET /categories — List all categories ───────────────────────

inventoryRouter.get('/categories', cacheResponse('categories', 60_000), async (_req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
    res.json({ ok: true, data: categories });
  } catch (err) {
    next(err);
  }
});

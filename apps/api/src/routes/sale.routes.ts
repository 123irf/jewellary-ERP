import { Router } from 'express';
import { createSaleSchema, saleListQuerySchema } from '@erp/types';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import {
  createSale,
  previewSale,
  getSaleDetail,
  listSales,
  voidSale,
} from '../services/sale.service.js';
import { cacheResponse } from '../middleware/cacheResponse.js';
import { invalidatePrefix } from '../lib/cache.js';

export const saleRouter: Router = Router();

saleRouter.use(authenticate);

// ─── POST /sales/preview — Dry-run pricing ──────────────────────
// Must come before /:id routes

saleRouter.post(
  '/preview',
  authorize('ADMIN', 'STAFF'),
  validate(createSaleSchema),
  async (req, res, next) => {
    try {
      const result = await previewSale(req.body);
      res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /sales — Create sale ──────────────────────────────────

saleRouter.post(
  '/',
  authorize('ADMIN', 'STAFF'),
  validate(createSaleSchema),
  async (req, res, next) => {
    try {
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      const sale = await createSale(req.body, req.user!.id, idempotencyKey);
      invalidatePrefix('sales');
      invalidatePrefix('products');
      invalidatePrefix('dues');
      invalidatePrefix('customers');
      res.status(201).json({
        ok: true,
        data: {
          sale,
          invoiceNumber: sale.invoiceNumber,
          printPayload: sale,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /sales — List with filters ─────────────────────────────

saleRouter.get(
  '/',
  validate(saleListQuerySchema, 'query'),
  cacheResponse('sales', 30_000),
  async (req, res, next) => {
    try {
      const result = await listSales(req.query as any);
      res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /sales/:id — Detail ────────────────────────────────────

saleRouter.get('/:id', async (req, res, next) => {
  try {
    const sale = await getSaleDetail(req.params.id);
    res.json({ ok: true, data: sale });
  } catch (err) {
    next(err);
  }
});

// ─── POST /sales/:id/void — Void sale (ADMIN only) ──────────────

saleRouter.post(
  '/:id/void',
  authorize('ADMIN'),
  async (req, res, next) => {
    try {
      const sale = await voidSale(req.params.id, req.user!.id);
      invalidatePrefix('sales');
      invalidatePrefix('products');
      invalidatePrefix('dues');
      invalidatePrefix('customers');
      res.json({ ok: true, data: sale });
    } catch (err) {
      next(err);
    }
  },
);

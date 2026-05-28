import { Router } from 'express';
import {
  createVendorSchema,
  updateVendorSchema,
  vendorListQuerySchema,
  createVendorTransactionSchema,
  vendorLedgerQuerySchema,
} from '@erp/types';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import {
  createVendor,
  listVendors,
  getVendorProfile,
  updateVendor,
  softDeleteVendor,
  createVendorTransaction,
  getVendorLedger,
  exportVendorLedger,
} from '../services/vendor.service.js';
import { cacheResponse } from '../middleware/cacheResponse.js';
import { invalidatePrefix } from '../lib/cache.js';

export const vendorRouter: Router = Router();

vendorRouter.use(authenticate);

// ─── POST /vendors — Create ──────────────────────────────────────

vendorRouter.post(
  '/',
  authorize('ADMIN', 'STAFF'),
  validate(createVendorSchema),
  async (req, res, next) => {
    try {
      const vendor = await createVendor(req.body, req.user!.id);
      invalidatePrefix('vendors');
      res.status(201).json({ ok: true, data: vendor });
    } catch (err) { next(err); }
  },
);

// ─── GET /vendors — List ─────────────────────────────────────────

vendorRouter.get(
  '/',
  validate(vendorListQuerySchema, 'query'),
  cacheResponse('vendors', 60_000),
  async (req, res, next) => {
    try {
      const result = await listVendors(req.query as any);
      res.json({ ok: true, data: result });
    } catch (err) { next(err); }
  },
);

// ─── GET /vendors/:id — Profile + Summary ────────────────────────

vendorRouter.get('/:id', async (req, res, next) => {
  try {
    const vendor = await getVendorProfile(req.params.id);
    res.json({ ok: true, data: vendor });
  } catch (err) { next(err); }
});

// ─── PATCH /vendors/:id — Edit basic info ────────────────────────

vendorRouter.patch(
  '/:id',
  authorize('ADMIN', 'STAFF'),
  validate(updateVendorSchema),
  async (req, res, next) => {
    try {
      const vendor = await updateVendor(req.params.id, req.body, req.user!.id);
      invalidatePrefix('vendors');
      res.json({ ok: true, data: vendor });
    } catch (err) { next(err); }
  },
);

// ─── DELETE /vendors/:id — Soft delete (ADMIN) ───────────────────

vendorRouter.delete(
  '/:id',
  authorize('ADMIN'),
  async (req, res, next) => {
    try {
      const result = await softDeleteVendor(req.params.id, req.user!.id);
      invalidatePrefix('vendors');
      res.json({ ok: true, data: result });
    } catch (err) { next(err); }
  },
);

// ─── POST /vendors/:id/transactions — Create transaction ─────────

vendorRouter.post(
  '/:id/transactions',
  authorize('ADMIN', 'STAFF'),
  validate(createVendorTransactionSchema),
  async (req, res, next) => {
    try {
      const txn = await createVendorTransaction(
        req.params.id, req.body, req.user!.id, req.user!.role,
      );
      invalidatePrefix('vendors');
      invalidatePrefix('products');
      res.status(201).json({ ok: true, data: txn });
    } catch (err) { next(err); }
  },
);

// ─── GET /vendors/:id/ledger — Ledger timeline ──────────────────

vendorRouter.get(
  '/:id/ledger',
  validate(vendorLedgerQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const result = await getVendorLedger(req.params.id, req.query as any);
      res.json({ ok: true, data: result });
    } catch (err) { next(err); }
  },
);

// ─── GET /vendors/:id/ledger/export — CSV export (ADMIN) ─────────

vendorRouter.get(
  '/:id/ledger/export',
  authorize('ADMIN'),
  async (req, res, next) => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      const { csv, vendor } = await exportVendorLedger(req.params.id, from, to);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${vendor.code}-ledger.csv"`);
      res.send(csv);
    } catch (err) { next(err); }
  },
);

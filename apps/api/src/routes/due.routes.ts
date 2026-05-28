import { Router } from 'express';
import {
  collectDuePaymentSchema,
  clearDueSchema,
  writeOffDueSchema,
  dueListQuerySchema,
} from '@erp/types';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import {
  listDues,
  getDueDetail,
  collectPayment,
  clearDue,
  writeOffDue,
  getAgingReport,
} from '../services/due.service.js';
import { cacheResponse } from '../middleware/cacheResponse.js';
import { invalidatePrefix } from '../lib/cache.js';

export const dueRouter: Router = Router();

dueRouter.use(authenticate);

// ─── GET /dues/aging-report — Portfolio aging (ADMIN only) ──────

dueRouter.get(
  '/aging-report',
  authorize('ADMIN'),
  cacheResponse('dues', 60_000),
  async (_req, res, next) => {
    try {
      const report = await getAgingReport();
      res.json({ ok: true, data: report });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /dues — List all dues ──────────────────────────────────

dueRouter.get(
  '/',
  validate(dueListQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const result = await listDues(req.query as any);
      res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /dues/:id — Detail ────────────────────────────────────

dueRouter.get('/:id', async (req, res, next) => {
  try {
    const due = await getDueDetail(req.params.id);
    res.json({ ok: true, data: due });
  } catch (err) {
    next(err);
  }
});

// ─── POST /dues/:id/payments — Collect payment ────────────────

dueRouter.post(
  '/:id/payments',
  authorize('ADMIN', 'STAFF'),
  validate(collectDuePaymentSchema),
  async (req, res, next) => {
    try {
      const result = await collectPayment(req.params.id, req.body, req.user!.id);
      invalidatePrefix('dues');
      invalidatePrefix('customers');
      res.status(201).json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /dues/:id/clear — Force-clear with full payment ─────

dueRouter.post(
  '/:id/clear',
  authorize('ADMIN', 'STAFF'),
  validate(clearDueSchema),
  async (req, res, next) => {
    try {
      const result = await clearDue(req.params.id, req.body, req.user!.id);
      invalidatePrefix('dues');
      invalidatePrefix('customers');
      res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /dues/:id/write-off — Bad-debt write-off (ADMIN) ────

dueRouter.post(
  '/:id/write-off',
  authorize('ADMIN'),
  validate(writeOffDueSchema),
  async (req, res, next) => {
    try {
      const due = await writeOffDue(req.params.id, req.body, req.user!.id);
      invalidatePrefix('dues');
      invalidatePrefix('customers');
      res.json({ ok: true, data: due });
    } catch (err) {
      next(err);
    }
  },
);

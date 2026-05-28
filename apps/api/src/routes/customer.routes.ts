import { Router } from 'express';
import { prisma } from '@erp/db';
import { createCustomerSchema, customerSearchQuerySchema } from '@erp/types';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { getCustomerDuesSummary } from '../services/due.service.js';
import { cacheResponse } from '../middleware/cacheResponse.js';
import { invalidatePrefix } from '../lib/cache.js';

export const customerRouter: Router = Router();

customerRouter.use(authenticate);

// ─── GET /customers — Paginated customer list ────────────────────

customerRouter.get('/', cacheResponse('customers', 30_000), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const q = (req.query.q as string)?.trim();

    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { phone: { contains: q } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          totalDue: true,
          createdAt: true,
        },
      }),
      prisma.customer.count({ where }),
    ]);

    res.json({
      ok: true,
      data: {
        items,
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

// ─── GET /customers/search?q=... — Phone-first lookup ───────────

customerRouter.get(
  '/search',
  validate(customerSearchQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const { q } = req.query as { q: string };

      const customers = await prisma.customer.findMany({
        where: {
          OR: [
            { phone: { contains: q } },
            { name: { contains: q, mode: 'insensitive' } },
          ],
        },
        orderBy: { name: 'asc' },
        take: 10,
      });

      res.json({ ok: true, data: customers });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /customers — Inline create (from POS) ─────────────────

customerRouter.post(
  '/',
  authorize('ADMIN', 'STAFF'),
  validate(createCustomerSchema),
  async (req, res, next) => {
    try {
      const { name, phone, email, gstin, address, stateCode } = req.body;

      // Check if customer with this phone already exists
      const existing = await prisma.customer.findUnique({ where: { phone } });
      if (existing) {
        // Return existing customer (spec: "Returns existing customer record")
        res.json({ ok: true, data: existing, existing: true });
        return;
      }

      const customer = await prisma.$transaction(async (tx) => {
        const c = await tx.customer.create({
          data: { name, phone, email, gstin, address, stateCode },
        });

        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            action: 'CUSTOMER_CREATE',
            entity: 'Customer',
            entityId: c.id,
            after: { name, phone },
          },
        });

        return c;
      });

      invalidatePrefix('customers');
      res.status(201).json({ ok: true, data: customer });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /customers/:id/dues-summary — Per-customer aging summary ─

customerRouter.get('/:id/dues-summary', async (req, res, next) => {
  try {
    const summary = await getCustomerDuesSummary(req.params.id);
    res.json({ ok: true, data: summary });
  } catch (err) {
    next(err);
  }
});

// ─── GET /customers/:id — Customer detail ────────────────────────

customerRouter.get('/:id', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: {
        sales: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            invoiceNumber: true,
            grandTotal: true,
            status: true,
            createdAt: true,
          },
        },
        dues: {
          where: { status: { in: ['PENDING', 'PARTIAL'] } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!customer) {
      res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: `Customer not found` },
      });
      return;
    }

    res.json({ ok: true, data: customer });
  } catch (err) {
    next(err);
  }
});

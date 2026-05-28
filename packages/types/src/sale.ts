import { z } from 'zod';

// ─── Discount Shape ─────────────────────────────────────────────

const discountSchema = z.object({
  type: z.enum(['AMOUNT', 'PCT']),
  value: z.number().positive('Discount value must be > 0'),
});

// ─── Create Sale ────────────────────────────────────────────────

export const createSaleSchema = z.object({
  customerId: z.string().cuid().optional(),
  walkIn: z.boolean().optional().default(false),
  items: z.array(z.object({
    productId: z.string().cuid(),
    quantity: z.number().int().positive('Quantity must be > 0'),
    lineDiscount: discountSchema.optional(),
  })).min(1, 'At least one item is required'),
  billDiscount: discountSchema.optional(),
  gstMode: z.enum(['INTRA', 'INTER']),
  payments: z.array(z.object({
    mode: z.enum(['CASH', 'UPI', 'CARD', 'CREDIT']),
    amount: z.number().positive('Payment amount must be > 0'),
    reference: z.string().max(200).optional(),
  })).min(1, 'At least one payment is required'),
  notes: z.string().max(1000).optional(),
}).superRefine((data, ctx) => {
  const hasCreditPayment = data.payments.some((p) => p.mode === 'CREDIT');

  // Walk-in with credit is not allowed
  if (data.walkIn && hasCreditPayment) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Walk-in customers cannot use credit payment',
      path: ['payments'],
    });
  }

  // Credit requires customerId
  if (hasCreditPayment && !data.customerId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'customerId is required when using credit payment',
      path: ['customerId'],
    });
  }

  // walkIn = true means no customerId
  if (data.walkIn && data.customerId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Walk-in sale must not have customerId',
      path: ['customerId'],
    });
  }
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;

// ─── Sale List Query ────────────────────────────────────────────

export const saleListQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  customerId: z.string().cuid().optional(),
  status: z.enum(['COMPLETED', 'VOIDED']).optional(),
  paymentMode: z.enum(['CASH', 'UPI', 'CARD', 'CREDIT']).optional(),
  q: z.string().optional(), // invoice number search
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type SaleListQuery = z.infer<typeof saleListQuerySchema>;

// ─── Customer Create (inline from POS) ──────────────────────────

export const createCustomerSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().regex(/^\d{10}$/, 'Phone must be 10 digits'),
  email: z.string().email().optional(),
  gstin: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format').optional(),
  address: z.string().max(500).optional(),
  stateCode: z.string().max(2).optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

// ─── Customer Search Query ──────────────────────────────────────

export const customerSearchQuerySchema = z.object({
  q: z.string().min(1), // phone or name
});

export type CustomerSearchQuery = z.infer<typeof customerSearchQuerySchema>;

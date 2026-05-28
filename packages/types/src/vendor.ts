import { z } from 'zod';

// GSTIN: 2-digit state code + 10-char PAN + 1 entity + 1 check + Z
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// ─── Create Vendor ───────────────────────────────────────────────

export const createVendorSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().regex(/^\d{10}$/, 'Phone must be 10 digits'),
  contactPerson: z.string().max(120).optional(),
  email: z.string().email().optional(),
  gstin: z.string().regex(GSTIN_REGEX, 'Invalid GSTIN format').optional(),
  address: z.string().max(500).optional(),
  openingBalance: z.number().min(0).optional(),
});

export type CreateVendorInput = z.infer<typeof createVendorSchema>;

// ─── Update Vendor ───────────────────────────────────────────────

export const updateVendorSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().regex(/^\d{10}$/, 'Phone must be 10 digits').optional(),
  contactPerson: z.string().max(120).nullable().optional(),
  email: z.string().email().nullable().optional(),
  gstin: z.string().regex(GSTIN_REGEX, 'Invalid GSTIN format').nullable().optional(),
  address: z.string().max(500).nullable().optional(),
});

export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;

// ─── Vendor List Query ───────────────────────────────────────────

export const vendorListQuerySchema = z.object({
  q: z.string().optional(),
  hasBalance: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type VendorListQuery = z.infer<typeof vendorListQuerySchema>;

// ─── Vendor Transaction Item ─────────────────────────────────────

const vendorTxnItemSchema = z.object({
  productId: z.string().cuid(),
  quantity: z.number().int().positive(),
  ratePerUnit: z.number().positive(),
});

// ─── Create Vendor Transaction ───────────────────────────────────

export const createVendorTransactionSchema = z.object({
  txnType: z.enum([
    'OPENING_BALANCE', 'PURCHASE', 'RETURN', 'PAYMENT',
    'ADVANCE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'ADJUSTMENT',
  ]),
  amount: z.number().positive('Amount must be > 0'),
  referenceNo: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  txnDate: z.string().datetime().optional(),
  direction: z.enum(['CREDIT', 'DEBIT']).optional(), // only for ADJUSTMENT
  items: z.array(vendorTxnItemSchema).optional(),
}).superRefine((data, ctx) => {
  // Items required for PURCHASE and RETURN
  if ((data.txnType === 'PURCHASE' || data.txnType === 'RETURN') && (!data.items || data.items.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `items are required for ${data.txnType} transactions`,
      path: ['items'],
    });
  }
  // Notes required for ADJUSTMENT
  if (data.txnType === 'ADJUSTMENT' && !data.notes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'notes are required for ADJUSTMENT transactions',
      path: ['notes'],
    });
  }
  // Direction required for ADJUSTMENT
  if (data.txnType === 'ADJUSTMENT' && !data.direction) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'direction is required for ADJUSTMENT transactions',
      path: ['direction'],
    });
  }
});

export type CreateVendorTransactionInput = z.infer<typeof createVendorTransactionSchema>;

// ─── Ledger Query ────────────────────────────────────────────────

export const vendorLedgerQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  txnType: z.enum([
    'OPENING_BALANCE', 'PURCHASE', 'RETURN', 'PAYMENT',
    'ADVANCE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'ADJUSTMENT',
  ]).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type VendorLedgerQuery = z.infer<typeof vendorLedgerQuerySchema>;

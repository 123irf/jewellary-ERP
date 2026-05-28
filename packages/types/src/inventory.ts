import { z } from 'zod';

// ─── Gold Purity ─────────────────────────────────────────────────

export const goldPurityEnum = z.enum(['K24', 'K22', 'K18', 'K14']);
export type GoldPurity = z.infer<typeof goldPurityEnum>;

// ─── Product Create ──────────────────────────────────────────────

export const createProductSchema = z.object({
  name: z.string().min(2).max(120),
  categoryId: z.string().cuid(),
  grossWeight: z.number().positive('Gross weight must be > 0'),
  stoneWeight: z.number().min(0, 'Stone weight must be >= 0').default(0),
  wastagePct: z.number().min(0).max(50),
  makingChargesPct: z.number().min(0).max(30).default(0),
  goldPurity: goldPurityEnum,
  stoneRatePerCt: z.number().positive().optional(),
  vendorId: z.string().cuid(),
  purchasePrice: z.number().positive('Purchase price must be > 0'),
  barcode: z.string().optional(),
  initialStock: z.number().int().min(0, 'Initial stock must be >= 0'),
  reorderLevel: z.number().int().min(0).default(2),
}).refine(
  (data) => data.grossWeight - data.stoneWeight > 0,
  { message: 'Net weight (grossWeight - stoneWeight) must be > 0', path: ['grossWeight'] }
);

export type CreateProductInput = z.infer<typeof createProductSchema>;

// ─── Product Update ──────────────────────────────────────────────

export const updateProductSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  categoryId: z.string().cuid().optional(),
  grossWeight: z.number().positive().optional(),
  stoneWeight: z.number().min(0).optional(),
  wastagePct: z.number().min(0).max(50).optional(),
  makingChargesPct: z.number().min(0).max(30).optional(),
  goldPurity: goldPurityEnum.optional(),
  stoneRatePerCt: z.number().positive().nullable().optional(),
  vendorId: z.string().cuid().optional(),
  purchasePrice: z.number().positive().optional(),
  barcode: z.string().nullable().optional(),
  reorderLevel: z.number().int().min(0).optional(),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ─── Product List Query ──────────────────────────────────────────

export const productListQuerySchema = z.object({
  q: z.string().optional(),
  categoryId: z.string().cuid().optional(),
  vendorId: z.string().cuid().optional(),
  lowStock: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;

// ─── Gold Rate ───────────────────────────────────────────────────

export const createGoldRateSchema = z.object({
  purity: goldPurityEnum,
  ratePerGm: z.number().positive('Rate must be > 0'),
});

export type CreateGoldRateInput = z.infer<typeof createGoldRateSchema>;

// ─── Price Preview ───────────────────────────────────────────────

export const pricePreviewSchema = z.object({
  grossWeight: z.number().positive(),
  stoneWeight: z.number().min(0).default(0),
  wastagePct: z.number().min(0).max(50),
  makingChargesPct: z.number().min(0).max(30).default(0),
  goldPurity: goldPurityEnum,
  stoneRatePerCt: z.number().positive().optional(),
}).refine(
  (data) => data.grossWeight - data.stoneWeight > 0,
  { message: 'Net weight must be > 0', path: ['grossWeight'] }
);

export type PricePreviewInput = z.infer<typeof pricePreviewSchema>;

// ─── Stock Adjustment ────────────────────────────────────────────

export const stockAdjustmentSchema = z.object({
  type: z.enum(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE']),
  quantity: z.number().int().positive('Quantity must be > 0'),
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
});

export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

// ─── Stock Movement Query (Cross-Product Feed) ─────────────────

export const stockMovementQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  type: z.enum([
    'OPENING', 'PURCHASE', 'RETURN_OUT', 'SALE', 'VOID_REVERSAL',
    'CUSTOMER_RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'AUDIT_CORRECTION',
  ]).optional(),
  userId: z.string().cuid().optional(),
  categoryId: z.string().cuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type StockMovementQuery = z.infer<typeof stockMovementQuerySchema>;

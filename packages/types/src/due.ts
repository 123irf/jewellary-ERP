import { z } from 'zod';

// ─── Collect Payment (POST /dues/:id/payments) ──────────────────

export const collectDuePaymentSchema = z.object({
  mode: z.enum(['CASH', 'UPI', 'CARD']),
  amount: z.number().positive('Payment amount must be > 0'),
  reference: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
});

export type CollectDuePaymentInput = z.infer<typeof collectDuePaymentSchema>;

// ─── Force-Clear (POST /dues/:id/clear) ─────────────────────────

export const clearDueSchema = z.object({
  mode: z.enum(['CASH', 'UPI', 'CARD']),
  reference: z.string().max(200).optional(),
});

export type ClearDueInput = z.infer<typeof clearDueSchema>;

// ─── Write-Off (POST /dues/:id/write-off) ───────────────────────

export const writeOffDueSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(1000),
});

export type WriteOffDueInput = z.infer<typeof writeOffDueSchema>;

// ─── Due List Query (GET /dues) ─────────────────────────────────

export const dueListQuerySchema = z.object({
  customerId: z.string().cuid().optional(),
  status: z.enum(['PENDING', 'PARTIAL', 'CLEARED', 'VOIDED']).optional(),
  overdue: z.coerce.boolean().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type DueListQuery = z.infer<typeof dueListQuerySchema>;

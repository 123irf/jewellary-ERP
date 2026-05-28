import type { Prisma, StockMovementType } from '@erp/db';
import { InsufficientStockError } from '../lib/errors.js';

interface RecordMovementArgs {
  productId: string;
  type: StockMovementType;
  quantityDelta: number;
  saleId?: string;
  vendorTxnId?: string;
  notes?: string;
  userId: string;
}

/**
 * Central function for all stock changes. Must be called inside a prisma.$transaction.
 * 1. SELECT FOR UPDATE on Product row
 * 2. Compute newStock
 * 3. Reject if newStock < 0
 * 4. Update Product.currentStock
 * 5. Insert StockMovement with stockAfter
 */
export async function recordMovement(
  tx: Prisma.TransactionClient,
  args: RecordMovementArgs,
) {
  // Row-level lock on the product
  const [product] = await tx.$queryRawUnsafe<Array<{ id: string; currentStock: number }>>(
    `SELECT "id", "currentStock" FROM "Product" WHERE "id" = $1 FOR UPDATE`,
    args.productId,
  );

  if (!product) {
    throw new Error(`Product ${args.productId} not found`);
  }

  const newStock = product.currentStock + args.quantityDelta;
  if (newStock < 0) {
    throw new InsufficientStockError(args.productId, Math.abs(args.quantityDelta), product.currentStock);
  }

  // Update cached currentStock
  await tx.product.update({
    where: { id: args.productId },
    data: { currentStock: newStock },
  });

  // Insert immutable movement record
  const movement = await tx.stockMovement.create({
    data: {
      productId: args.productId,
      type: args.type,
      quantityDelta: args.quantityDelta,
      stockAfter: newStock,
      saleId: args.saleId,
      vendorTxnId: args.vendorTxnId,
      notes: args.notes,
      createdById: args.userId,
    },
  });

  return movement;
}

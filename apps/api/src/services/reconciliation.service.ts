import { prisma } from '@erp/db';
import { recordMovement } from './stockMovement.service.js';

interface DriftRow {
  id: string;
  name: string;
  sku: string;
  currentStock: number;
  computedStock: bigint;
}

/**
 * Nightly reconciliation job (spec §7).
 *
 * For each active product, compares `Product.currentStock` against
 * `SUM(StockMovement.quantityDelta)`. If they differ, inserts an
 * `AUDIT_CORRECTION` movement and logs an AuditLog entry.
 *
 * In a healthy system this produces zero corrections.
 * Non-zero output is a P1 incident.
 *
 * @param systemUserId  The user ID to attribute corrections to (should be a system/admin account)
 * @returns Summary of corrections made
 */
export async function runReconciliation(systemUserId: string) {
  const drifted = await prisma.$queryRaw<DriftRow[]>`
    SELECT
      p."id",
      p."name",
      p."sku",
      p."currentStock",
      COALESCE(SUM(sm."quantityDelta"), 0)::bigint AS "computedStock"
    FROM "Product" p
    LEFT JOIN "StockMovement" sm ON sm."productId" = p."id"
    WHERE p."isActive" = true
    GROUP BY p."id", p."name", p."sku", p."currentStock"
    HAVING p."currentStock" != COALESCE(SUM(sm."quantityDelta"), 0)
  `;

  const corrections: Array<{ productId: string; sku: string; drift: number }> = [];

  for (const row of drifted) {
    const computedStock = Number(row.computedStock);
    const drift = computedStock - row.currentStock;

    await prisma.$transaction(async (tx) => {
      await recordMovement(tx, {
        productId: row.id,
        type: 'AUDIT_CORRECTION',
        quantityDelta: drift,
        userId: systemUserId,
        notes: `Auto-reconciliation: cached drift detected (cached=${row.currentStock}, computed=${computedStock})`,
      });

      await tx.auditLog.create({
        data: {
          userId: systemUserId,
          action: 'RECONCILIATION_CORRECTION',
          entity: 'Product',
          entityId: row.id,
          before: { currentStock: row.currentStock },
          after: { currentStock: computedStock, drift },
        },
      });
    });

    corrections.push({ productId: row.id, sku: row.sku, drift });
  }

  return {
    checkedAt: new Date().toISOString(),
    correctionCount: corrections.length,
    corrections,
  };
}

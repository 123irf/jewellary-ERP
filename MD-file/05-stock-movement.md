# 05 — Stock Movement Tracking

> **Prerequisite:** Read `00-architecture.md` and `01-inventory.md`.

---

## 1. Purpose

`StockMovement` is the **immutable transaction log** of inventory. Every quantity change in the system writes one row here. It's the audit ground truth — `Product.currentStock` is a cache, but `StockMovement` is the proof.

If `Product.currentStock` ever drifts from `SUM(StockMovement.quantityDelta)`, the movement log wins and the cache is corrected.

---

## 2. Movement Types

| Type | Direction | Source module | Notes |
|------|-----------|---------------|-------|
| `OPENING` | + | Inventory | Initial stock at product creation |
| `PURCHASE` | + | Vendor Ledger | Stock received from vendor |
| `RETURN_OUT` | − | Vendor Ledger | Stock returned to vendor |
| `SALE` | − | POS | Sold to customer |
| `VOID_REVERSAL` | + | POS | Sale voided, stock returned |
| `CUSTOMER_RETURN` | + | POS | Customer returned goods (v2) |
| `ADJUSTMENT_IN` | + | Inventory | Manual correction (ADMIN only) |
| `ADJUSTMENT_OUT` | − | Inventory | Manual correction (ADMIN only) |
| `DAMAGE` | − | Inventory | Damaged / written off |
| `AUDIT_CORRECTION` | ± | System | Nightly reconciliation fix |

---

## 3. Database Schema (Prisma)

```prisma
enum StockMovementType {
  OPENING
  PURCHASE
  RETURN_OUT
  SALE
  VOID_REVERSAL
  CUSTOMER_RETURN
  ADJUSTMENT_IN
  ADJUSTMENT_OUT
  DAMAGE
  AUDIT_CORRECTION
}

model StockMovement {
  id              String             @id @default(cuid())
  productId       String
  product         Product            @relation(fields: [productId], references: [id])

  type            StockMovementType
  quantityDelta   Int                // +N or -N; never 0
  stockAfter      Int                // snapshot of Product.currentStock AFTER this movement

  // Polymorphic source — exactly one of these is non-null per row
  saleId          String?
  sale            Sale?              @relation(fields: [saleId], references: [id])
  vendorTxnId     String?
  vendorTransaction VendorTransaction? @relation(fields: [vendorTxnId], references: [id])

  notes           String?
  createdById     String
  createdBy       User               @relation(fields: [createdById], references: [id])
  createdAt       DateTime           @default(now())

  @@index([productId, createdAt])
  @@index([type, createdAt])
  @@index([saleId])
  @@index([vendorTxnId])
}
```

**CHECK constraint — non-zero delta:**
```sql
ALTER TABLE "StockMovement" ADD CONSTRAINT movement_delta_nonzero CHECK ("quantityDelta" <> 0);
ALTER TABLE "StockMovement" ADD CONSTRAINT movement_stock_after_nonneg CHECK ("stockAfter" >= 0);
```

**Polymorphic source rule (enforced in service layer):**
- `SALE` and `VOID_REVERSAL` → `saleId` required, `vendorTxnId` null
- `PURCHASE` and `RETURN_OUT` → `vendorTxnId` required, `saleId` null
- All others → both null

---

## 4. Immutability Contract

- **No UPDATE.** No endpoint, no admin override, can modify an existing row.
- **No DELETE.** Same.
- Corrections happen via a new `ADJUSTMENT_IN` / `ADJUSTMENT_OUT` row that explains the previous error in `notes`.
- Enforce at DB level: revoke UPDATE and DELETE privileges on `StockMovement` for the application role; only a separate `db_admin` role can touch it (migrations / disaster recovery).

```sql
REVOKE UPDATE, DELETE ON "StockMovement" FROM app_user;
```

---

## 5. Write Paths (Who Creates Movements)

Every write happens inside the calling module's transaction. The movement module exposes one internal service function, not REST endpoints (except admin adjustments).

```ts
// services/stockMovement.ts
async function recordMovement(tx: PrismaTx, args: {
  productId: string;
  type: StockMovementType;
  quantityDelta: number;
  saleId?: string;
  vendorTxnId?: string;
  notes?: string;
  userId: string;
}): Promise<StockMovement> {
  // 1. SELECT FOR UPDATE on Product row
  // 2. Compute newStock = currentStock + quantityDelta
  // 3. If newStock < 0 → throw INSUFFICIENT_STOCK
  // 4. Update Product.currentStock = newStock
  // 5. Insert StockMovement with stockAfter = newStock
  // 6. Return movement
}
```

**Callers:**
- `inventoryService.createProduct` → `OPENING`
- `inventoryService.adjustStock` → `ADJUSTMENT_IN`/`OUT`/`DAMAGE`
- `vendorService.createTransaction` (PURCHASE) → `PURCHASE` per item
- `vendorService.createTransaction` (RETURN) → `RETURN_OUT` per item
- `salesService.createSale` → `SALE` per item
- `salesService.voidSale` → `VOID_REVERSAL` per item

---

## 6. API Contracts

### `GET /api/v1/products/:id/movements` — Timeline
**Query:** `from`, `to`, `type`, `page`, `pageSize`
Returns chronological list with `stockAfter` per row → reads as a stepped chart.

**Response shape:**
```json
{
  "ok": true,
  "data": {
    "movements": [
      {
        "id": "...",
        "type": "PURCHASE",
        "quantityDelta": 10,
        "stockAfter": 10,
        "createdAt": "2025-11-15T10:00:00Z",
        "source": {
          "kind": "vendor",
          "vendorTxnId": "...",
          "vendorName": "Sri Krishna Jewellers",
          "referenceNo": "PO-2025-042"
        },
        "createdBy": { "id": "...", "name": "Anjali" },
        "notes": null
      },
      { "...": "..." }
    ],
    "pagination": { ... }
  }
}
```

### `POST /api/v1/products/:id/adjust-stock` — Manual adjustment
**Role:** ADMIN only
**Body:**
```ts
{
  type: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'DAMAGE';
  quantity: number;       // always positive; sign comes from type
  reason: string;         // required, min 10 chars
}
```

### `GET /api/v1/stock-movements` — Cross-product feed (ADMIN)
Filtered view of all movements. Useful for daily ops dashboard.
**Query:** `from`, `to`, `type`, `userId`, `categoryId`, `page`, `pageSize`

### `GET /api/v1/stock-movements/reconciliation` — Health check
**Role:** ADMIN only
Returns products where `currentStock != SUM(quantityDelta)`. Should always be empty in a healthy system.

---

## 7. Nightly Reconciliation Job

Runs at 02:00 IST via cron / Bull queue.

```
for each product:
  computedStock = SUM(StockMovement.quantityDelta WHERE productId = p.id)
  if computedStock != product.currentStock:
    insert StockMovement(
      type = AUDIT_CORRECTION,
      quantityDelta = computedStock - product.currentStock,
      notes = "Auto-reconciliation: cached drift detected"
    )
    update product.currentStock = computedStock
    insert AuditLog with full context
    send alert to ADMIN (email / Slack webhook)
```

In a correctly-functioning system, this job writes zero rows. Non-zero output is a P1 incident.

---

## 8. Frontend Views

| Route | Purpose |
|-------|---------|
| `/inventory/:id/timeline` | Per-product timeline with type filter and stock-after chart |
| `/stock-movements` | Cross-product log (ADMIN), with filters |
| `/stock-movements/reconciliation` | ADMIN health dashboard |

**UI rules:**
- Timeline rows are visually chunked by date.
- Each row shows the **stockAfter** as a small badge — easy to scan for drops/spikes.
- Source links: clicking a `PURCHASE` row navigates to the vendor transaction; clicking a `SALE` row navigates to the invoice.
- `ADJUSTMENT_*` and `DAMAGE` rows highlighted (amber/red) with reason always visible.
- Stock-after line chart at the top of the timeline page (Recharts or Tremor) showing the curve over time.

---

## 9. Edge Cases & Failure Modes

| Case | Behavior |
|------|----------|
| Two concurrent sales of the last unit | `SELECT FOR UPDATE` serializes; loser gets `INSUFFICIENT_STOCK` before any movement row is written |
| Process crashes between Product update and StockMovement insert | Impossible — both inside one DB transaction. Either both commit or both roll back |
| Manual SQL run by DBA bypasses application | Reconciliation job catches it next night and writes `AUDIT_CORRECTION` |
| Movement row inserted with delta=0 | DB rejects via CHECK constraint |
| Movement with negative `stockAfter` | DB rejects via CHECK constraint |
| Historical query performance | Composite index `(productId, createdAt)` covers timeline; range scans cheap |
| Very long timelines (10K+ movements) | Cursor pagination, not OFFSET; default `pageSize = 50`, max 200 |
| Product soft-deleted but has movements | Movements remain queryable; product detail still loadable in read-only mode |

---

## 10. Acceptance Criteria

- [ ] No application code path can write to `StockMovement` outside `recordMovement()`.
- [ ] No code path updates `Product.currentStock` without also inserting a `StockMovement` row in the same transaction.
- [ ] Attempting to UPDATE or DELETE a `StockMovement` row fails (DB permission).
- [ ] Timeline for any product reads correctly with `stockAfter` matching the running sum of `quantityDelta` from origin.
- [ ] Reconciliation job, run on a healthy DB, produces zero corrections.
- [ ] After a void sale, the timeline shows a `SALE` row followed by a matching `VOID_REVERSAL` row referencing the same `saleId`.
- [ ] STAFF cannot reach `/adjust-stock`, `/stock-movements`, or `/reconciliation` (403).
- [ ] Performance: timeline query for 10K-movement product returns first page in < 200ms.

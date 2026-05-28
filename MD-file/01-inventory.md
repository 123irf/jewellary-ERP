# 01 — Inventory Module

> **Prerequisite:** Read `00-architecture.md` for stack, auth, audit, and transaction conventions.

---

## 1. Purpose

Single source of truth for every jewelry product in stock. Owns the canonical `currentStock` value, drives selling-price calculation off the live gold rate, and emits a `StockMovement` row for every quantity change.

---

## 2. Domain Concepts

### Selling price formula (jewelry-specific)

```
goldValue   = netWeight × currentGoldRate
wastageCost = goldValue × (wastagePct / 100)
makingCost  = goldValue × (makingChargesPct / 100)
stoneCost   = stoneWeight × stoneRatePerCt   (optional, if stone present)
basePrice   = goldValue + wastageCost + makingCost + stoneCost
sellingPrice = basePrice                  -- GST applied at POS, NOT stored on product
```

- `netWeight` = `grossWeight − stoneWeight` (validated on save)
- `currentGoldRate` is **not** stored on the product. It's stored once in a `GoldRate` table and joined at read time. The product row carries `goldPurity` (22K, 18K, etc.) to pick the right rate.
- Selling price is **computed on read**, never persisted, so rate changes propagate instantly.

### Stock semantics
- `currentStock` is **derived** from `SUM(StockMovement.quantityDelta) WHERE productId = ?` but also **cached** on the `Product` row for read performance. Cache is updated inside the same transaction that writes the movement. Reconciliation job runs nightly.

---

## 3. Database Schema (Prisma)

```prisma
enum GoldPurity {
  K24
  K22
  K18
  K14
}

model Category {
  id          String    @id @default(cuid())
  name        String    @unique
  description String?
  products    Product[]
  createdAt   DateTime  @default(now())
}

model Product {
  id                String           @id @default(cuid())
  sku               String           @unique
  barcode           String?          @unique
  name              String
  categoryId        String
  category          Category         @relation(fields: [categoryId], references: [id])

  // Weights (grams, 3-decimal precision)
  grossWeight       Decimal          @db.Decimal(10, 3)
  netWeight         Decimal          @db.Decimal(10, 3)
  stoneWeight       Decimal          @db.Decimal(10, 3) @default(0)

  // Pricing inputs
  goldPurity        GoldPurity
  wastagePct        Decimal          @db.Decimal(5, 2)
  makingChargesPct  Decimal          @db.Decimal(5, 2) @default(0)
  stoneRatePerCt    Decimal?         @db.Decimal(12, 2)
  purchasePrice     Decimal          @db.Decimal(12, 2)

  // Stock
  currentStock      Int              @default(0)
  reorderLevel      Int              @default(2)

  // Vendor
  vendorId          String
  vendor            Vendor           @relation(fields: [vendorId], references: [id])

  // Soft delete
  isActive          Boolean          @default(true)

  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt
  createdById       String
  createdBy         User             @relation("ProductCreator", fields: [createdById], references: [id])

  movements         StockMovement[]
  saleItems         SaleItem[]
  vendorTxnItems   VendorTransactionItem[]

  @@index([categoryId])
  @@index([vendorId])
  @@index([isActive, currentStock])
}

model GoldRate {
  id        String     @id @default(cuid())
  purity    GoldPurity
  ratePerGm Decimal    @db.Decimal(12, 2)
  effectiveFrom DateTime @default(now())
  setBy     String
  user      User       @relation(fields: [setBy], references: [id])

  @@index([purity, effectiveFrom])
}
```

**CHECK constraints (raw SQL in migration):**
```sql
ALTER TABLE "Product" ADD CONSTRAINT product_stock_nonneg CHECK ("currentStock" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT product_weight_consistent CHECK ("netWeight" = "grossWeight" - "stoneWeight");
ALTER TABLE "Product" ADD CONSTRAINT product_weight_positive CHECK ("grossWeight" > 0 AND "netWeight" > 0);
```

---

## 4. API Contracts

All routes mounted under `/api/v1/inventory`. All require auth.

### `POST /products` — Create
**Role:** ADMIN, STAFF
**Body (Zod):**
```ts
{
  name: string;             // min 2, max 120
  categoryId: string;       // cuid
  grossWeight: number;      // > 0
  stoneWeight: number;      // >= 0
  wastagePct: number;       // 0–50
  makingChargesPct?: number;// 0–30
  goldPurity: 'K24'|'K22'|'K18'|'K14';
  stoneRatePerCt?: number;
  vendorId: string;
  purchasePrice: number;    // > 0
  barcode?: string;
  initialStock: number;     // >= 0
  reorderLevel?: number;
}
```
**Server logic:**
1. Compute `netWeight = grossWeight - stoneWeight`. Reject if `<= 0`.
2. Generate SKU: `{CATEGORY_CODE}-{YYMM}-{SEQ}` (e.g. `RNG-2511-0042`).
3. Open transaction:
   - Insert `Product` with `currentStock = 0`.
   - If `initialStock > 0`: insert `StockMovement` (`type = OPENING`, `delta = +initialStock`) and increment `currentStock`.
   - Insert `AuditLog`.
4. Return product with computed `sellingPrice`.

### `GET /products` — List
**Query:** `q`, `categoryId`, `vendorId`, `lowStock=true`, `page`, `pageSize`
**Returns:** paginated list with computed `sellingPrice` per row (join latest `GoldRate` by purity).

### `GET /products/:id` — Detail
Returns full product + last 50 stock movements + vendor summary + computed selling price breakdown (every cost component, not just total).

### `PATCH /products/:id` — Edit
**Role:** ADMIN, STAFF
**Restrictions:**
- STAFF cannot edit `purchasePrice` (locked once set).
- Nobody can edit `sku` after creation.
- Editing weight fields requires re-validating the weight CHECK.
- Writes full before/after snapshot to `AuditLog`.

### `DELETE /products/:id` — Soft delete
**Role:** ADMIN only
- Sets `isActive = false`. Hard delete forbidden if any `SaleItem` references it (FK).

### `POST /gold-rate` — Update gold rate
**Role:** ADMIN only
**Body:** `{ purity, ratePerGm }`
Inserts a new `GoldRate` row (history preserved). All product sellingPrice reads use latest by `effectiveFrom`.

### `GET /low-stock` — Low stock alert
Returns products where `currentStock <= reorderLevel AND isActive = true`. Cache in Redis with 60s TTL if Redis enabled.

---

## 5. Frontend Views

| Route                            | Purpose                                       |
|----------------------------------|-----------------------------------------------|
| `/inventory`                     | Paginated table, filters, search by SKU/barcode |
| `/inventory/new`                 | Create form (live selling price preview)      |
| `/inventory/:id`                 | Detail page with cost breakdown card          |
| `/inventory/:id/edit`            | Edit form (audit-warning banner for ADMIN)    |
| `/inventory/:id/timeline`        | Stock movement timeline (see module 05)       |
| `/inventory/low-stock`           | Filtered list, badge in nav with count        |
| `/inventory/gold-rate`           | ADMIN-only rate setter with history table     |

**UI rules:**
- Selling price recomputes live as user edits weight/wastage/purity — fetched from `/products/preview-price` (server endpoint that runs same formula without persisting).
- Negative stock attempts must be **prevented in the form**, not just rejected by API.
- Barcode field accepts scanner input (autofocus, Enter to submit).

---

## 6. Edge Cases & Failure Modes

| Case | Behavior |
|------|----------|
| Gross weight < stone weight | Validation error, form-level + API-level |
| No active `GoldRate` for purity | API returns product with `sellingPrice: null` and warning flag; UI shows "Set gold rate first" |
| Concurrent edits to same product | Optimistic locking via `updatedAt` — client sends `If-Unmodified-Since`; 409 on mismatch |
| Bulk import with duplicate SKUs | Reject entire batch (transaction), return per-row errors |
| Decimal rounding drift | All arithmetic in `Decimal.js`, never JS `Number`. Round only at display |
| Deleting a vendor with active products | Forbidden; FK ON DELETE RESTRICT |
| Product with 0 stock but pending sale | Stock guard runs at sale time; product can exist in catalog with 0 stock |
| Negative `initialStock` on create | 400 validation |
| SKU collision (rare) | Retry sequence generation up to 3 times, then 500 |

---

## 7. Acceptance Criteria

- [ ] Cannot save a product with `netWeight ≤ 0`.
- [ ] Selling price visible on list and detail page reflects current gold rate within 60s of rate change.
- [ ] Editing any field writes a complete before/after row to `AuditLog`.
- [ ] Low-stock view returns correct rows; badge count matches.
- [ ] Stock cannot go below zero through any API path (verified by attempting oversell in test).
- [ ] STAFF cannot reach gold rate endpoint (403).
- [ ] Soft-deleted products do not appear in POS search but remain in audit history.

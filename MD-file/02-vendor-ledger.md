# 02 — Vendor Ledger

> **Prerequisite:** Read `00-architecture.md` and `01-inventory.md`.

---

## 1. Purpose

Track every financial movement with each vendor — stock received, returns, payments made, advances given — and maintain a running balance so the business knows at any moment "how much do we owe / how much have we overpaid".

**Accounting convention used:**
- `CREDIT` = vendor's account credited (we owe them more) → purchase, opening balance liability
- `DEBIT`  = vendor's account debited (we owe them less) → payment made, return, advance

`runningBalance` is from **our** point of view:
- Positive → we owe the vendor
- Negative → vendor owes us (we've overpaid or have credit notes pending)

---

## 2. Domain Model

```
Vendor (1) ─── (N) VendorTransaction ─── (N) VendorTransactionItem ─── (1) Product
                          │
                          └── (1) StockMovement   (only for PURCHASE / RETURN types)
```

---

## 3. Database Schema (Prisma)

```prisma
enum VendorTxnType {
  OPENING_BALANCE   // initial liability when vendor is created mid-business
  PURCHASE          // stock received → CREDIT vendor
  RETURN            // stock returned → DEBIT vendor
  PAYMENT           // we paid vendor → DEBIT vendor
  ADVANCE           // we paid in advance → DEBIT vendor
  CREDIT_NOTE       // vendor issued credit → DEBIT vendor
  DEBIT_NOTE        // we issued debit → CREDIT vendor
  ADJUSTMENT        // manual correction, requires ADMIN + note
}

enum VendorTxnDirection {
  CREDIT
  DEBIT
}

model Vendor {
  id              String   @id @default(cuid())
  code            String   @unique             // VEN-0001, sequence-generated
  name            String
  contactPerson   String?
  phone           String
  email           String?
  gstin           String?
  address         String?

  runningBalance  Decimal  @db.Decimal(14, 2) @default(0)

  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  products        Product[]
  transactions    VendorTransaction[]

  @@index([isActive])
  @@index([name])
}

model VendorTransaction {
  id             String              @id @default(cuid())
  vendorId       String
  vendor         Vendor              @relation(fields: [vendorId], references: [id])

  txnType        VendorTxnType
  direction      VendorTxnDirection
  amount         Decimal             @db.Decimal(14, 2)

  // Running balance AFTER this transaction is applied (snapshot for audit)
  balanceAfter   Decimal             @db.Decimal(14, 2)

  referenceNo    String?             // PO number, payment ref, cheque no.
  notes          String?
  txnDate        DateTime            @default(now())

  createdById    String
  createdBy      User                @relation(fields: [createdById], references: [id])
  createdAt      DateTime            @default(now())

  items          VendorTransactionItem[]
  stockMovements StockMovement[]     // FK from StockMovement.vendorTxnId

  @@index([vendorId, txnDate])
  @@index([txnType])
}

model VendorTransactionItem {
  id                  String   @id @default(cuid())
  vendorTxnId         String
  vendorTransaction   VendorTransaction @relation(fields: [vendorTxnId], references: [id], onDelete: Cascade)

  productId           String
  product             Product  @relation(fields: [productId], references: [id])

  quantity            Int
  ratePerUnit         Decimal  @db.Decimal(12, 2)
  lineTotal           Decimal  @db.Decimal(14, 2)   // quantity * ratePerUnit

  @@index([productId])
}
```

**CHECK constraints:**
```sql
ALTER TABLE "VendorTransaction" ADD CONSTRAINT vendor_txn_amount_positive CHECK ("amount" > 0);
ALTER TABLE "VendorTransactionItem" ADD CONSTRAINT vendor_item_qty_positive CHECK ("quantity" > 0);
```

---

## 4. Running Balance Logic

```
on PURCHASE   (CREDIT): runningBalance += amount
on RETURN     (DEBIT) : runningBalance -= amount
on PAYMENT    (DEBIT) : runningBalance -= amount
on ADVANCE    (DEBIT) : runningBalance -= amount
on CREDIT_NOTE(DEBIT) : runningBalance -= amount
on DEBIT_NOTE (CREDIT): runningBalance += amount
on OPENING    (CREDIT): runningBalance += amount
on ADJUSTMENT : applied per direction
```

**Atomicity:** every transaction insert + balance update + (optional) stock movement run inside one `prisma.$transaction`. `balanceAfter` is captured at write time so historical reports never drift even if a past transaction is later corrected via `ADJUSTMENT`.

---

## 5. API Contracts

Mounted under `/api/v1/vendors`.

### `POST /vendors` — Create vendor
**Role:** ADMIN, STAFF
**Body:**
```ts
{
  name: string;
  phone: string;        // 10-digit India
  contactPerson?: string;
  email?: string;
  gstin?: string;       // 15-char GSTIN regex
  address?: string;
  openingBalance?: number;   // if > 0, creates OPENING_BALANCE txn
}
```

### `GET /vendors` — List
**Query:** `q`, `hasBalance` (filter to vendors with non-zero balance), `page`, `pageSize`
Sort: by `runningBalance DESC` by default to surface biggest liabilities.

### `GET /vendors/:id` — Profile + summary
Returns vendor + totals (lifetime purchase, lifetime payments, current balance) + last 10 transactions.

### `POST /vendors/:id/transactions` — Add transaction
**Role:** ADMIN, STAFF (STAFF cannot create `ADJUSTMENT`)
**Body:**
```ts
{
  txnType: VendorTxnType;
  amount: number;            // > 0
  referenceNo?: string;
  notes?: string;
  txnDate?: string;          // defaults now
  items?: Array<{            // required for PURCHASE and RETURN
    productId: string;
    quantity: number;
    ratePerUnit: number;
  }>;
}
```

**Server logic per type:**

| txnType | direction | Stock impact | Item required |
|---------|-----------|--------------|---------------|
| PURCHASE | CREDIT | `+quantity` per item via `StockMovement(type=PURCHASE)` | yes |
| RETURN | DEBIT | `-quantity` per item via `StockMovement(type=RETURN_OUT)`; reject if stock would go negative | yes |
| PAYMENT | DEBIT | none | no |
| ADVANCE | DEBIT | none | no |
| CREDIT_NOTE | DEBIT | none | no |
| DEBIT_NOTE | CREDIT | none | no |
| OPENING_BALANCE | CREDIT | none | no |
| ADJUSTMENT | per body | none | no |

Validation:
- For PURCHASE: `amount` must equal `SUM(items.lineTotal)`. Reject mismatch (no silent reconciliation).
- For RETURN: same equality check.
- For ADJUSTMENT: `notes` is required.

### `GET /vendors/:id/ledger` — Ledger timeline
**Query:** `from`, `to` (date range), `txnType`, `q` (matches referenceNo or notes), `page`, `pageSize`
Returns chronological list with `balanceAfter` per row → renders as a running ledger.

### `GET /vendors/:id/ledger/export` — CSV / PDF
**Role:** ADMIN only
Server-side render with full transaction history + opening/closing balances for the date range.

### `DELETE /vendors/:id` — Soft delete
**Role:** ADMIN only. Blocked if `runningBalance != 0` or any active product references this vendor.

---

## 6. Frontend Views

| Route                                | Purpose                                              |
|--------------------------------------|------------------------------------------------------|
| `/vendors`                           | List with balance column, search                     |
| `/vendors/new`                       | Create form                                          |
| `/vendors/:id`                       | Profile + summary cards + recent activity            |
| `/vendors/:id/ledger`                | Full ledger timeline with filters                    |
| `/vendors/:id/transactions/new`      | Form with type-aware fields (items shown only for PURCHASE/RETURN) |
| `/vendors/:id/edit`                  | Edit basic info (not balance)                        |

**UI rules:**
- Ledger view shows running balance as a stepped column (visually obvious when it crosses zero).
- Each row links to the source `StockMovement` if applicable.
- `ADJUSTMENT` rows highlighted (amber) with notes always visible.
- `referenceNo` is searchable and linked to source document (e.g., a `PAYMENT` txn with `referenceNo = 'CHQ-12345'` is searchable from anywhere).

---

## 7. Edge Cases & Failure Modes

| Case | Behavior |
|------|----------|
| Purchase items reference inactive product | Reject; force re-activation first |
| Return quantity exceeds current stock | 400 `INSUFFICIENT_STOCK`, no partial return |
| Backdated transaction (`txnDate` in past) | Allowed but `balanceAfter` is computed as if appended at end of ledger; warning shown to user. Strict mode (config flag) can require recomputation of subsequent rows — left out of v1 |
| Negative runningBalance | Allowed (vendor owes us); not an error |
| Two staff create transactions simultaneously | Serialized via row-level lock on `Vendor` row inside transaction: `SELECT ... FOR UPDATE` |
| GSTIN format invalid | 400 with regex hint |
| Delete vendor with balance | 409, must settle first |

---

## 8. Acceptance Criteria

- [ ] Creating a PURCHASE transaction increases stock and credits vendor in one atomic operation.
- [ ] Ledger view shows correct `balanceAfter` for every row; sum from zero matches `Vendor.runningBalance`.
- [ ] RETURN cannot make stock negative.
- [ ] Concurrent transactions never produce inconsistent balances (tested with 100 parallel writes).
- [ ] STAFF cannot create ADJUSTMENT (403).
- [ ] Export contains opening + closing balance for the date range, matches sum of in-range transactions.
- [ ] Soft-deleting a vendor with active products is blocked.

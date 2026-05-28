# 03 — POS Billing

> **Prerequisite:** Read `00-architecture.md`, `01-inventory.md`, `04-customer-dues.md`.

---

## 1. Purpose

Operate the counter. Search products, build a cart, apply discount + GST, split payment across cash / UPI / credit, deduct inventory, and (if credit) create a customer due — all in a single atomic transaction that produces a printable invoice.

---

## 2. Sale Flow (End to End)

```
1. Staff opens /pos
2. Search product (SKU / barcode / name)        ─► GET /products?q=...
3. Add to cart (line locked at current sellingPrice + weight snapshot)
4. Optionally apply per-line discount or bill-level discount
5. Select / create customer (mandatory if any credit payment)
6. Enter payment split: cash, UPI, credit (sum must equal grand total)
7. Submit                                       ─► POST /sales
   Server transaction:
     a. Re-lock prices from current GoldRate (reject if changed > X% since cart load — config)
     b. SELECT ... FOR UPDATE on each Product row
     c. Verify currentStock >= quantity for every line
     d. Insert Sale, SaleItem[], Payment[]
     e. Insert StockMovement (-qty, type=SALE) for each line
     f. Decrement Product.currentStock
     g. If credit portion > 0: insert CustomerDue
     h. Insert AuditLog
   Commit → return invoice payload
8. UI prints invoice (browser print or thermal printer endpoint)
```

---

## 3. Pricing Math (Per Sale)

```
For each line:
  lineGoldValue   = netWeight × goldRate(purity)
  lineWastage     = lineGoldValue × wastagePct/100
  lineMaking      = lineGoldValue × makingChargesPct/100
  lineStone       = stoneWeight × stoneRatePerCt
  lineBase        = (lineGoldValue + lineWastage + lineMaking + lineStone) × quantity
  lineDiscount    = explicit amount or pct of lineBase
  lineSubtotal    = lineBase − lineDiscount

Bill:
  subtotal        = SUM(lineSubtotal)
  billDiscount    = explicit or pct
  taxableAmount   = subtotal − billDiscount
  cgst            = taxableAmount × 1.5%        (intra-state)
  sgst            = taxableAmount × 1.5%
  igst            = taxableAmount × 3.0%        (inter-state, instead of CGST+SGST)
  grandTotal      = taxableAmount + cgst + sgst   OR   taxableAmount + igst
```

- GST rate for gold jewelry (India): **3% total** (1.5 CGST + 1.5 SGST intra-state, 3 IGST inter-state). Making charges attract 5% under HSN 9988, but most retailers bill at 3% all-in — keep it configurable per shop (`Setting.gstMode`).
- Customer's state vs shop's state determines CGST+SGST vs IGST.
- All math uses `Decimal.js`. Round each line to 2 decimals before summing.

---

## 4. Database Schema (Prisma)

```prisma
enum PaymentMode {
  CASH
  UPI
  CARD
  CREDIT
}

enum SaleStatus {
  COMPLETED
  VOIDED       // soft-void by ADMIN; reverses stock + due
}

model Customer {
  id           String        @id @default(cuid())
  name         String
  phone        String        @unique
  email        String?
  gstin        String?
  address      String?
  stateCode    String?       // for GST inter/intra-state logic
  totalDue     Decimal       @db.Decimal(14, 2) @default(0)

  createdAt    DateTime      @default(now())
  sales        Sale[]
  dues         CustomerDue[]

  @@index([phone])
  @@index([totalDue])
}

model Sale {
  id              String       @id @default(cuid())
  invoiceNumber   String       @unique         // INV-2025-26-00001, FY-sequenced

  customerId      String?
  customer        Customer?    @relation(fields: [customerId], references: [id])
  customerWalkIn  Boolean      @default(false) // true when no customer captured

  // Pricing snapshot
  subtotal        Decimal      @db.Decimal(14, 2)
  totalDiscount   Decimal      @db.Decimal(14, 2) @default(0)
  taxableAmount   Decimal      @db.Decimal(14, 2)
  cgst            Decimal      @db.Decimal(14, 2) @default(0)
  sgst            Decimal      @db.Decimal(14, 2) @default(0)
  igst            Decimal      @db.Decimal(14, 2) @default(0)
  grandTotal      Decimal      @db.Decimal(14, 2)

  // Payment summary
  amountPaid      Decimal      @db.Decimal(14, 2)
  creditAmount    Decimal      @db.Decimal(14, 2) @default(0)

  status          SaleStatus   @default(COMPLETED)
  notes           String?

  createdById     String
  createdBy       User         @relation(fields: [createdById], references: [id])
  createdAt       DateTime     @default(now())

  items           SaleItem[]
  payments        Payment[]
  movements       StockMovement[]
  due             CustomerDue?

  @@index([customerId])
  @@index([createdAt])
  @@index([status])
}

model SaleItem {
  id              String   @id @default(cuid())
  saleId          String
  sale            Sale     @relation(fields: [saleId], references: [id], onDelete: Cascade)

  productId       String
  product         Product  @relation(fields: [productId], references: [id])

  // Snapshot — never read from Product after sale
  productName     String
  sku             String
  goldPurity      String
  goldRateAtSale  Decimal  @db.Decimal(12, 2)
  netWeight       Decimal  @db.Decimal(10, 3)
  stoneWeight     Decimal  @db.Decimal(10, 3)
  wastagePct      Decimal  @db.Decimal(5, 2)
  makingChargesPct Decimal @db.Decimal(5, 2)

  quantity        Int
  unitPrice       Decimal  @db.Decimal(14, 2)
  lineDiscount    Decimal  @db.Decimal(14, 2) @default(0)
  lineTotal       Decimal  @db.Decimal(14, 2)

  @@index([productId])
}

model Payment {
  id         String      @id @default(cuid())
  saleId     String
  sale       Sale        @relation(fields: [saleId], references: [id], onDelete: Cascade)

  mode       PaymentMode
  amount     Decimal     @db.Decimal(14, 2)
  reference  String?     // UPI txn id, card last 4, cheque no.
  createdAt  DateTime    @default(now())
}
```

**CHECK constraints:**
```sql
ALTER TABLE "Sale" ADD CONSTRAINT sale_amounts_match
  CHECK ("amountPaid" + "creditAmount" = "grandTotal");
ALTER TABLE "SaleItem" ADD CONSTRAINT sale_item_qty_positive CHECK ("quantity" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT payment_amount_positive CHECK ("amount" > 0);
```

---

## 5. API Contracts

### `POST /api/v1/sales` — Create sale
**Role:** ADMIN, STAFF
**Body:**
```ts
{
  customerId?: string;            // required if any payment.mode = CREDIT
  walkIn?: boolean;                // if true, customerId must be null
  items: Array<{
    productId: string;
    quantity: number;
    lineDiscount?: { type: 'AMOUNT'|'PCT', value: number };
  }>;
  billDiscount?: { type: 'AMOUNT'|'PCT', value: number };
  gstMode: 'INTRA' | 'INTER';
  payments: Array<{
    mode: 'CASH' | 'UPI' | 'CARD' | 'CREDIT';
    amount: number;
    reference?: string;
  }>;
  notes?: string;
}
```

**Validation:**
1. `payments.sum(amount) == grandTotal` (server-recomputed)
2. If any `mode = CREDIT`, `customerId` is required
3. `walkIn = true` AND credit payment → 400
4. Every productId is active + has sufficient stock
5. `gstMode` consistent with customer's state (warn if mismatch but allow override)

**Response:**
```json
{
  "ok": true,
  "data": {
    "sale": { ...full sale... },
    "invoiceNumber": "INV-2025-26-00042",
    "printPayload": { ...everything needed by invoice template... }
  }
}
```

### `GET /api/v1/sales` — List
**Query:** `from`, `to`, `customerId`, `status`, `paymentMode`, `q` (invoice no), `page`, `pageSize`

### `GET /api/v1/sales/:id` — Detail with full breakdown

### `POST /api/v1/sales/:id/void` — Void sale
**Role:** ADMIN only
**Server logic (transactional):**
- Set `status = VOIDED`
- For every `SaleItem`: insert reversing `StockMovement(type=VOID_REVERSAL, +quantity)`, increment `Product.currentStock`
- If `CustomerDue` exists: mark cleared with reason `VOIDED`, adjust `Customer.totalDue`
- Audit log entry

### `POST /api/v1/sales/preview` — Dry-run pricing
Same body as `/sales`, but no persistence. Used by frontend for live total updates.

---

## 6. Frontend Views

| Route | Purpose |
|-------|---------|
| `/pos` | Main billing screen — split layout: search/cart left, payment/customer right |
| `/sales` | List of past sales with filters |
| `/sales/:id` | Invoice view + print + void (admin) |

**POS UI rules:**
- Cart persists in `sessionStorage` keyed by user — survives accidental refresh.
- Barcode scanner: input field auto-focused, Enter adds product with `quantity = 1`.
- Payment split shows live "remaining" amount; submit disabled until it's exactly 0.
- Customer picker: phone-number-first lookup; "create new" inline form if not found.
- For CREDIT payments: visible warning banner "This will create a customer due of ₹X".
- After successful sale: invoice modal with print button; printer command via `window.print()` on a print-optimized route `/sales/:id/print`.

---

## 7. Edge Cases & Failure Modes

| Case | Behavior |
|------|----------|
| Gold rate changed mid-cart | Server reprices; if delta > 0.5% (config), reject with `RATE_CHANGED` so user re-confirms |
| Insufficient stock for one line | Whole transaction rolls back, error names the offending product |
| Network drop after server commit but before client response | Idempotency key (UUID generated client-side, sent as `Idempotency-Key` header) — replays return same result |
| Customer phone collision on new-customer create | Returns existing customer record; UI shows "Existing customer — using their profile" |
| Walk-in with credit | 400 — credit requires identified customer |
| Negative discount | 400 |
| Discount > line total | 400 (subtotal can't be negative) |
| GST mode toggled mid-cart | Recompute totals client-side; payment split must be re-entered if it no longer matches |
| Void after due partially paid | Allowed; remaining unpaid portion of due is cancelled, paid portion converts to `CustomerCredit` (overpayment) — see module 04 |
| Concurrent sale of last unit | `SELECT FOR UPDATE` ensures only one transaction wins; loser gets `INSUFFICIENT_STOCK` |

---

## 8. Acceptance Criteria

- [ ] A complete sale creates Sale + SaleItems + StockMovements + Payments (+ CustomerDue if credit) atomically.
- [ ] Inventory decrements exactly match sale quantity for every line.
- [ ] Server-computed grand total equals sum of payments (CHECK constraint enforces it).
- [ ] Voiding a sale fully reverses stock and clears any due in one transaction.
- [ ] Pricing snapshot on `SaleItem` is immutable — changing the product's weight later does NOT change the historical invoice.
- [ ] STAFF cannot void sales (403).
- [ ] Idempotency: duplicate POST with same `Idempotency-Key` returns the original sale, not a duplicate.
- [ ] Invoice number is unique, FY-aware, gapless within FY.

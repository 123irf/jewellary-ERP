# 04 — Customer Due Management

> **Prerequisite:** Read `00-architecture.md` and `03-pos-billing.md`.

---

## 1. Purpose

When a sale is paid wholly or partly on credit, a `CustomerDue` row is created. This module manages the lifecycle of those dues: collecting partial payments, clearing them, viewing aging, and handling overpayments.

---

## 2. Lifecycle States

```
            ┌────────────┐
   sale ──► │   PENDING  │
            └─────┬──────┘
                  │ partial payment
                  ▼
            ┌────────────┐
            │  PARTIAL   │
            └─────┬──────┘
                  │ full payment
                  ▼
            ┌────────────┐
            │  CLEARED   │
            └────────────┘

   any state ──► VOIDED   (via sale void)
```

---

## 3. Domain Model

```
Customer (1) ─── (N) CustomerDue (1:1 with Sale that has credit)
                      │
                      └─── (N) CustomerDuePayment   (collection events)
```

---

## 4. Database Schema (Prisma)

```prisma
enum DueStatus {
  PENDING
  PARTIAL
  CLEARED
  VOIDED
}

model CustomerDue {
  id              String                @id @default(cuid())
  customerId      String
  customer        Customer              @relation(fields: [customerId], references: [id])
  saleId          String                @unique
  sale            Sale                  @relation(fields: [saleId], references: [id])

  originalAmount  Decimal               @db.Decimal(14, 2)
  paidAmount      Decimal               @db.Decimal(14, 2) @default(0)
  balanceAmount   Decimal               @db.Decimal(14, 2)   // originalAmount - paidAmount, denormalized for fast queries

  status          DueStatus             @default(PENDING)
  dueDate         DateTime?             // optional, set by user at sale time

  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt
  clearedAt       DateTime?

  payments        CustomerDuePayment[]

  @@index([customerId, status])
  @@index([status, dueDate])
}

model CustomerDuePayment {
  id          String        @id @default(cuid())
  dueId       String
  due         CustomerDue   @relation(fields: [dueId], references: [id], onDelete: Cascade)

  mode        PaymentMode   // reuse enum from POS module — but CREDIT is forbidden here
  amount      Decimal       @db.Decimal(14, 2)
  reference   String?
  notes       String?

  receivedById String
  receivedBy   User         @relation(fields: [receivedById], references: [id])
  createdAt    DateTime     @default(now())
}

model CustomerCredit {
  // Tracks overpayments — when a customer pays more than the due, or when
  // a partially-paid sale is voided.
  id           String     @id @default(cuid())
  customerId   String
  customer     Customer   @relation(fields: [customerId], references: [id])
  amount       Decimal    @db.Decimal(14, 2)     // remaining credit
  source       String     // "OVERPAYMENT" | "SALE_VOID" | "MANUAL"
  sourceRefId  String?
  notes        String?
  createdAt    DateTime   @default(now())
  isActive     Boolean    @default(true)
}
```

**CHECK constraints:**
```sql
ALTER TABLE "CustomerDue" ADD CONSTRAINT due_amounts_nonneg
  CHECK ("paidAmount" >= 0 AND "balanceAmount" >= 0 AND "balanceAmount" <= "originalAmount");
ALTER TABLE "CustomerDuePayment" ADD CONSTRAINT due_payment_no_credit
  CHECK ("mode" <> 'CREDIT');
ALTER TABLE "CustomerDuePayment" ADD CONSTRAINT due_payment_positive CHECK ("amount" > 0);
```

---

## 5. Business Rules

1. **One due per sale.** Enforced by `@unique` on `saleId`. A sale either has credit (→ due) or doesn't.
2. **Partial payments allowed.** Each `CustomerDuePayment` reduces `balanceAmount` and bumps `paidAmount`. Status auto-transitions: `PENDING → PARTIAL` on first payment, `→ CLEARED` when `balanceAmount = 0`.
3. **Overpayment.** If a customer pays more than `balanceAmount`, the excess creates a `CustomerCredit` row, NOT a negative balance.
4. **Customer.totalDue** is denormalized = `SUM(CustomerDue.balanceAmount WHERE status IN (PENDING, PARTIAL))`. Updated in same transaction as any due change. Reconciliation job nightly.
5. **No deletion.** Dues are never deleted, only `VOIDED` (via sale void) or `CLEARED`. Payment history is immutable.
6. **STAFF restrictions:** STAFF can collect payments and clear dues but **cannot edit historical dues** (e.g., change `originalAmount`, `dueDate`). Only ADMIN can.

---

## 6. API Contracts

Mounted under `/api/v1/dues`.

### `GET /dues` — List all dues
**Query:** `customerId`, `status`, `overdue=true`, `from`, `to`, `page`, `pageSize`
Default sort: `dueDate ASC`, then `createdAt ASC`.

### `GET /dues/:id` — Detail
Returns due + full payment history + linked sale summary.

### `POST /dues/:id/payments` — Collect payment
**Role:** ADMIN, STAFF
**Body:**
```ts
{
  mode: 'CASH' | 'UPI' | 'CARD';   // CREDIT forbidden
  amount: number;                   // > 0
  reference?: string;
  notes?: string;
}
```
**Server logic (transactional):**
1. `SELECT ... FOR UPDATE` on `CustomerDue` row
2. If `status IN (CLEARED, VOIDED)`: reject 409
3. Compute `excess = amount - balanceAmount`
4. Insert `CustomerDuePayment` (use `min(amount, balanceAmount)` as the applied amount logically — but store the actual amount paid)
5. Update due:
   - `paidAmount += appliedAmount`
   - `balanceAmount -= appliedAmount`
   - `status = balanceAmount == 0 ? CLEARED : PARTIAL`
   - `clearedAt = now()` if cleared
6. If `excess > 0`: insert `CustomerCredit(amount=excess, source='OVERPAYMENT', sourceRefId=dueId)`
7. Decrement `Customer.totalDue` by `appliedAmount`
8. AuditLog

### `POST /dues/:id/clear` — Force-clear with full payment
Shortcut for "clear remaining balance with one payment". Body just needs `mode`, optional `reference`. Server computes amount = `balanceAmount`.

### `POST /dues/:id/write-off` — Bad-debt write-off
**Role:** ADMIN only
**Body:** `{ reason: string }`
Sets `status = CLEARED`, `balanceAmount = 0`, AuditLog with reason. Does NOT create a payment record — accounting-side write-off is a separate operation. Required for old uncollectable dues.

### `GET /customers/:id/dues-summary` — Per-customer summary
Returns:
```json
{
  "totalDue": "12500.00",
  "openCount": 3,
  "overdueCount": 1,
  "credits": "500.00",
  "agingBuckets": {
    "current":    "5000.00",
    "1-30days":   "2500.00",
    "31-60days":  "3000.00",
    "61-90days":  "0.00",
    "90plus":     "2000.00"
  }
}
```

### `GET /dues/aging-report` — Portfolio aging
**Role:** ADMIN only
Aggregates aging buckets across all customers. CSV export available.

---

## 7. Frontend Views

| Route | Purpose |
|-------|---------|
| `/dues` | All pending/partial dues, sortable by aging |
| `/dues/:id` | Single due detail + collect-payment form |
| `/customers/:id` | Customer profile with dues tab |
| `/customers/:id/dues` | Per-customer due history (cleared + open) |
| `/dues/aging` | ADMIN aging report |

**UI rules:**
- Open dues older than `dueDate` shown in red.
- "Collect payment" is a single-screen flow: pick mode → enter amount → confirm. No multi-step wizard.
- Partial-payment progress bar on each due row.
- Customer profile header shows `totalDue` prominently — clicking opens the dues list pre-filtered.
- Overpayment creates a visible "Credit issued: ₹X" toast after submit.
- Write-off button hidden for STAFF.

---

## 8. Edge Cases & Failure Modes

| Case | Behavior |
|------|----------|
| Two staff collect payments on same due simultaneously | Row lock; second one re-validates and may complete with reduced balance or hit `CLEARED` 409 |
| Customer wants to use existing credit toward new due | Out of scope for v1 — credit applied manually as `CASH` mode with notes referencing credit; v2 will add "apply credit" endpoint |
| Sale voided after partial collection | Sale-void handler marks due `VOIDED`, paid portion becomes `CustomerCredit(source=SALE_VOID)` |
| Payment amount > balance | Allowed → excess becomes credit |
| Payment of 0 or negative | 400 |
| Due with no `dueDate` | Never marked overdue; aging counted from `createdAt` |
| Reactivating a cleared due | Forbidden — create a new sale instead |
| `Customer.totalDue` drift from reconciliation | Nightly job logs discrepancy + auto-corrects; alert sent to ADMIN |

---

## 9. Acceptance Criteria

- [ ] Every credit sale creates exactly one due with matching `originalAmount`.
- [ ] `Customer.totalDue` always equals SUM of open dues for that customer (verified by reconciliation job).
- [ ] Partial payments transition status correctly: PENDING → PARTIAL → CLEARED.
- [ ] Overpayment never produces negative balance; produces a `CustomerCredit` row.
- [ ] STAFF cannot write off dues (403).
- [ ] Sale void on a partially-paid due preserves the paid amount as a credit.
- [ ] Aging buckets in summary endpoint are correct against test fixtures spanning multiple date ranges.
- [ ] Payment history is append-only — no endpoint allows editing or deleting `CustomerDuePayment`.

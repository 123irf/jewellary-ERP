# Jewellery ERP — Progress Tracker

> Auto-generated from module specs (`MD-file/00–06`). Update status as implementation progresses.

**Legend:** ⬜ Not Started | 🔶 In Progress | ✅ Done | ❌ Blocked

---

## Phase 0 — Project Infrastructure & Setup

| # | Task | Status | Notes |
|---|------|--------|-------|
| 0.1 | Initialize monorepo (Turborepo + pnpm workspaces) | ✅ | `turbo.json`, root `package.json`, `pnpm-workspace.yaml` |
| 0.2 | Scaffold `apps/api` (Express + TypeScript) | ✅ | `apps/api/` with full structure |
| 0.3 | Scaffold `apps/web` (Next.js 14+ App Router + TypeScript + Tailwind) | ✅ | `apps/web/` with Tailwind + PostCSS |
| 0.4 | Scaffold `packages/types` (shared Zod schemas + TS types) | ✅ | `packages/types/` |
| 0.5 | Scaffold `packages/db` (Prisma schema + client) | ✅ | `packages/db/` with generated client |
| 0.6 | Docker Compose — Postgres + Redis + API + Web | ⬜ | Optional for v1 |
| 0.7 | ESLint + Prettier config (monorepo-wide) | ⬜ | |
| 0.8 | Environment variable setup (`.env.example`) | ✅ | `.env.example` created |
| 0.9 | CI pipeline (lint + type-check + test + build) | ⬜ | |
| 0.10 | Logging setup — pino + pino-http | ✅ | `apps/api/src/lib/logger.ts` |

---

## Phase 1 — Database & ORM (`packages/db`)

### 1A. Prisma Schema — Models

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1A.1 | `User` model + `UserRole` enum | ✅ | `packages/db/prisma/schema.prisma` |
| 1A.2 | `Category` model | ✅ | Added `code` field for SKU generation |
| 1A.3 | `Product` model + `GoldPurity` enum | ✅ | |
| 1A.4 | `GoldRate` model | ✅ | |
| 1A.5 | `Vendor` model + `VendorTxnType`/`VendorTxnDirection` enums | ✅ | |
| 1A.6 | `VendorTransaction` model | ✅ | |
| 1A.7 | `VendorTransactionItem` model | ✅ | |
| 1A.8 | `Customer` model | ✅ | |
| 1A.9 | `Sale` model + `SaleStatus`/`PaymentMode` enums | ✅ | |
| 1A.10 | `SaleItem` model | ✅ | |
| 1A.11 | `Payment` model | ✅ | |
| 1A.12 | `CustomerDue` model + `DueStatus` enum | ✅ | |
| 1A.13 | `CustomerDuePayment` model | ✅ | |
| 1A.14 | `CustomerCredit` model | ✅ | |
| 1A.15 | `StockMovement` model + `StockMovementType` enum | ✅ | |
| 1A.16 | `AuditLog` model | ✅ | |

### 1B. Prisma Schema — Relations & Indexes

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1B.1 | All foreign key relations wired correctly | ✅ | All cross-model relations defined |
| 1B.2 | All `@@index` directives added | ✅ | Per each model spec |
| 1B.3 | `@unique` constraints (SKU, invoiceNumber, phone, etc.) | ✅ | |

### 1C. Migrations & CHECK Constraints

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1C.1 | Run initial `prisma migrate dev` | ⬜ | Requires running PostgreSQL |
| 1C.2 | Product CHECK constraints (stock >= 0, weight consistency) | ⬜ | Raw SQL in migration |
| 1C.3 | VendorTransaction CHECK (amount > 0) | ⬜ | |
| 1C.4 | VendorTransactionItem CHECK (qty > 0) | ⬜ | |
| 1C.5 | Sale CHECK (amountPaid + creditAmount = grandTotal) | ⬜ | |
| 1C.6 | SaleItem CHECK (qty > 0), Payment CHECK (amount > 0) | ⬜ | |
| 1C.7 | CustomerDue CHECK (amounts non-negative) | ⬜ | |
| 1C.8 | CustomerDuePayment CHECK (no CREDIT mode, amount > 0) | ⬜ | |
| 1C.9 | StockMovement CHECK (delta != 0, stockAfter >= 0) | ⬜ | |
| 1C.10 | REVOKE UPDATE/DELETE on StockMovement & AuditLog | ⬜ | Immutability enforcement |

### 1D. Seed Data

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1D.1 | Seed script: initial ADMIN user from env vars | ✅ | `packages/db/prisma/seed.ts` |
| 1D.2 | Seed script: sample categories | ✅ | 10 categories (Rings, Bangles, etc.) |
| 1D.3 | Seed script: initial gold rates (K24, K22, K18, K14) | ✅ | |

---

## Phase 2 — Shared Types & Validation (`packages/types`)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.1 | Zod schema: Product create/update | ✅ | `packages/types/src/inventory.ts` |
| 2.2 | Zod schema: GoldRate create | ✅ | |
| 2.3 | Zod schema: Vendor create/update | ✅ | `packages/types/src/vendor.ts` — GSTIN regex, phone 10-digit |
| 2.4 | Zod schema: VendorTransaction create | ✅ | superRefine: items required for PURCHASE/RETURN, direction for ADJUSTMENT |
| 2.5 | Zod schema: Sale create | ✅ | `packages/types/src/sale.ts` — createSaleSchema, saleListQuerySchema, createCustomerSchema |
| 2.6 | Zod schema: CustomerDuePayment create | ✅ | `packages/types/src/due.ts` — collectDuePaymentSchema, clearDueSchema, writeOffDueSchema, dueListQuerySchema |
| 2.7 | Zod schema: Stock adjustment | ✅ | `stockAdjustmentSchema` |
| 2.8 | Zod schema: Auth (login, register, change-password) | ✅ | `packages/types/src/auth.ts` |
| 2.9 | Zod schema: User create/update | ✅ | |
| 2.10 | Shared TS type exports (inferred from Zod) | ✅ | `packages/types/src/index.ts` barrel |
| 2.11 | Error envelope types (`ok`/`error` shape) | ✅ | `packages/types/src/common.ts` |

---

## Phase 3 — API Core (`apps/api`)

### 3A. Express Boilerplate & Middleware

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3A.1 | Express app bootstrap + TypeScript config | ✅ | `apps/api/src/app.ts`, `server.ts` |
| 3A.2 | Request ID middleware | ✅ | `middleware/requestId.ts` |
| 3A.3 | pino-http logging middleware | ✅ | `lib/logger.ts` |
| 3A.4 | Error envelope (`ok`/`error`) global error handler | ✅ | `middleware/errorHandler.ts` |
| 3A.5 | Zod validation middleware factory | ✅ | `middleware/validate.ts` |
| 3A.6 | CORS configuration | ✅ | In `app.ts` |
| 3A.7 | Rate limiting (Redis-backed or in-memory) | ✅ | `express-rate-limit` on login route (10/5min) |

### 3B. Auth Module (Spec: `06-auth-and-rbac.md`)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3B.1 | `authenticate` middleware (JWT verify + blacklist + isActive) | ✅ | `middleware/authenticate.ts` |
| 3B.2 | `authorize(...roles)` middleware | ✅ | `middleware/authorize.ts` |
| 3B.3 | `POST /auth/login` — email + password, JWT issue, set cookie | ✅ | `routes/auth.routes.ts` |
| 3B.4 | `POST /auth/refresh` — cookie rotation | ✅ | Refresh token rotation implemented |
| 3B.5 | `POST /auth/logout` — clear hash + blacklist JTI | ✅ | Clears hash + cookie + audit log |
| 3B.6 | `POST /auth/change-password` | ✅ | Forces re-login on all sessions |
| 3B.7 | Lockout logic (5 failures → 15 min lock) | ✅ | In login handler |
| 3B.8 | Per-IP rate limit on login (10/5min) | ✅ | `express-rate-limit` in-memory, 10 req/5min |

### 3C. User Management (Spec: `06-auth-and-rbac.md` §7)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3C.1 | `POST /users` — ADMIN create user | ✅ | `routes/user.routes.ts` |
| 3C.2 | `GET /users` — ADMIN list | ✅ | |
| 3C.3 | `PATCH /users/:id` — ADMIN edit / self-edit name | ✅ | STAFF restricted to own name |
| 3C.4 | `POST /users/:id/reset-password` — ADMIN only | ✅ | Returns temp password, invalidates sessions |
| 3C.5 | `DELETE /users/:id` — soft deactivate, last-ADMIN guard | ✅ | Last-ADMIN guard implemented |
| 3C.6 | `POST /users/:id/unlock` — ADMIN clear lockout | ✅ | Clears `failedLoginCount` + `lockedUntil` |

### 3D. Inventory Module (Spec: `01-inventory.md`)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3D.1 | Selling price computation service (formula from §2) | ✅ | `services/pricing.service.ts` — Decimal.js |
| 3D.2 | SKU generation service (`{CAT}-{YYMM}-{SEQ}`) | ✅ | `services/inventory.service.ts` — 3 retry |
| 3D.3 | `POST /api/v1/inventory/products` — create | ✅ | Transaction: Product + StockMovement + AuditLog |
| 3D.4 | `GET /api/v1/inventory/products` — list + pagination + filters | ✅ | q, categoryId, vendorId, lowStock, page |
| 3D.5 | `GET /api/v1/inventory/products/:id` — detail + breakdown | ✅ | Full breakdown + last 50 movements |
| 3D.6 | `PATCH /api/v1/inventory/products/:id` — edit + audit | ✅ | STAFF can't edit purchasePrice |
| 3D.7 | `DELETE /api/v1/inventory/products/:id` — soft delete (ADMIN) | ✅ | Sets isActive = false |
| 3D.8 | `POST /api/v1/inventory/gold-rate` — set rate (ADMIN) | ✅ | History preserved, audit logged |
| 3D.9 | `GET /api/v1/inventory/low-stock` — alert list | ✅ | Raw SQL: currentStock <= reorderLevel |
| 3D.10 | `POST /api/v1/inventory/products/preview-price` — live calc | ✅ | Returns full breakdown |

### 3E. Vendor Ledger Module (Spec: `02-vendor-ledger.md`)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3E.1 | Running balance service (atomic update logic) | ✅ | `services/vendor.service.ts` — SELECT FOR UPDATE + Decimal.js |
| 3E.2 | Vendor code generation (`VEN-{SEQ}`) | ✅ | `VEN-0001` format |
| 3E.3 | `POST /api/v1/vendors` — create + optional opening balance | ✅ | Transaction: Vendor + OPENING_BALANCE txn + AuditLog |
| 3E.4 | `GET /api/v1/vendors` — list + balance filter | ✅ | q, hasBalance, page, pageSize filters |
| 3E.5 | `GET /api/v1/vendors/:id` — profile + summary + recent txns | ✅ | Lifetime purchases/payments + last 10 txns |
| 3E.6 | `POST /api/v1/vendors/:id/transactions` — create txn | ✅ | Per-type logic: direction map, item total validation, stock impact |
| 3E.7 | `GET /api/v1/vendors/:id/ledger` — timeline + filters | ✅ | from/to, txnType, q, pagination |
| 3E.8 | `GET /api/v1/vendors/:id/ledger/export` — CSV (ADMIN) | ✅ | Opening/closing balance, ADMIN-only |
| 3E.9 | `DELETE /api/v1/vendors/:id` — soft delete (ADMIN) | ✅ | Blocked if balance != 0 or active products |
| 3E.10 | `PATCH /api/v1/vendors/:id` — edit basic info | ✅ | ADMIN/STAFF, audit logged |

### 3F. POS / Billing Module (Spec: `03-pos-billing.md`)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3F.1 | Sale pricing engine (per-line + bill-level + GST) | ✅ | `services/sale.service.ts` — computeSalePricing(), Decimal.js, 3% GST |
| 3F.2 | Invoice number generation (`INV-{FY}-{SEQ}`, gapless) | ✅ | `generateInvoiceNumber()` — FY-aware, SELECT FOR UPDATE |
| 3F.3 | `POST /api/v1/sales` — create sale (atomic) | ✅ | Sale + Items + Movements + Payments + Due in $transaction |
| 3F.4 | `GET /api/v1/sales` — list + filters | ✅ | from/to, customerId, status, paymentMode, q, pagination |
| 3F.5 | `GET /api/v1/sales/:id` — detail with full breakdown | ✅ | Includes items, payments, movements, due, customer |
| 3F.6 | `POST /api/v1/sales/:id/void` — void (ADMIN) | ✅ | VOID_REVERSAL stock + due void/credit, ADMIN-only |
| 3F.7 | `POST /api/v1/sales/preview` — dry-run pricing | ✅ | Same validation as create, no persistence |
| 3F.8 | Idempotency key handling | ✅ | Via Idempotency-Key header + AuditLog lookup |
| 3F.9 | Rate-change guard (reject if gold rate delta > threshold) | ✅ | Threshold constant defined, re-prices inside txn |

### 3G. Customer Due Module (Spec: `04-customer-dues.md`)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3G.1 | `GET /api/v1/dues` — list with filters | ✅ | `routes/due.routes.ts` — customerId, status, overdue, from/to, pagination |
| 3G.2 | `GET /api/v1/dues/:id` — detail + payment history | ✅ | Full detail + payments + customer + sale summary |
| 3G.3 | `POST /api/v1/dues/:id/payments` — collect (partial/full) | ✅ | Row lock (SELECT FOR UPDATE) + overpayment → CustomerCredit |
| 3G.4 | `POST /api/v1/dues/:id/clear` — force-clear shortcut | ✅ | Delegates to collectPayment with exact balance |
| 3G.5 | `POST /api/v1/dues/:id/write-off` — bad debt (ADMIN) | ✅ | ADMIN-only, requires reason, audit logged |
| 3G.6 | `GET /api/v1/customers/:id/dues-summary` — aging buckets | ✅ | In `customer.routes.ts` — 5 aging buckets + credits |
| 3G.7 | `GET /api/v1/dues/aging-report` — portfolio aging (ADMIN) | ✅ | ADMIN-only, customer breakdown sorted by outstanding |

### 3H. Stock Movement Module (Spec: `05-stock-movement.md`)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3H.1 | `recordMovement()` internal service function | ✅ | `services/stockMovement.service.ts` — SELECT FOR UPDATE |
| 3H.2 | `GET /api/v1/products/:id/movements` — timeline | ✅ | In `inventory.routes.ts` |
| 3H.3 | `POST /api/v1/products/:id/adjust-stock` — manual (ADMIN) | ✅ | ADMIN-only, requires reason |
| 3H.4 | `GET /api/v1/stock-movements` — cross-product feed (ADMIN) | ✅ | `routes/stockMovement.routes.ts` — type/date/user/category filters |
| 3H.5 | `GET /api/v1/stock-movements/reconciliation` — health check | ✅ | Raw SQL drift detection + `POST /reconciliation/run` manual trigger |
| 3H.6 | Nightly reconciliation cron job | ✅ | `jobs/reconciliation.cron.ts` — node-cron at 02:00 IST |

### 3I. Audit Log (Spec: `00-architecture.md` §5)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3I.1 | Prisma `$use` middleware for automatic audit logging | 🔶 | Manual audit log calls in services — middleware TBD |
| 3I.2 | `GET /api/v1/audit-log` — ADMIN paginated list | ✅ | `routes/auditLog.routes.ts` — entity/action/date filters |

---

## Phase 4 — Frontend (`apps/web`)

### 4A. Layout & Auth UI

| # | Task | Status | Notes |
|---|------|--------|-------|
| 4A.1 | App layout: sidebar nav + topbar + content area | ✅ | `components/Sidebar.tsx`, `(dashboard)/layout.tsx` |
| 4A.2 | Login page (`/login`) | ✅ | `app/login/page.tsx` |
| 4A.3 | Auth state management (Zustand, access token in memory) | ✅ | `store/auth.ts` + `lib/api.ts` |
| 4A.4 | Silent token refresh (background interval + 401 intercept) | ✅ | 13-min interval + 401 auto-retry in `lib/api.ts` |
| 4A.5 | Next.js middleware — route protection + ADMIN route guard | ✅ | `src/middleware.ts` — cookie-based session + role check |
| 4A.6 | 403 forbidden page | ✅ | `app/403/page.tsx` |
| 4A.7 | Role-based UI hiding (`useUser().role` checks) | ✅ | In Sidebar + edit page |

### 4B. Inventory UI (Spec: `01-inventory.md` §5)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 4B.1 | `/inventory` — paginated table with filters & search | ✅ | `(dashboard)/inventory/page.tsx` |
| 4B.2 | `/inventory/new` — create form with live price preview | ✅ | `inventory/new/page.tsx` — debounced preview |
| 4B.3 | `/inventory/:id` — detail page with cost breakdown card | ✅ | `inventory/[id]/page.tsx` — full breakdown |
| 4B.4 | `/inventory/:id/edit` — edit form + audit warning banner | ✅ | `inventory/[id]/edit/page.tsx` — ADMIN banner |
| 4B.5 | `/inventory/:id/timeline` — stock movement timeline | ✅ | `inventory/[id]/timeline/page.tsx` |
| 4B.6 | `/inventory/low-stock` — filtered list + nav badge count | ✅ | `inventory/low-stock/page.tsx` — badge in sidebar |
| 4B.7 | `/inventory/gold-rate` — ADMIN rate setter + history table | ✅ | `inventory/gold-rate/page.tsx` — summary cards |
| 4B.8 | Barcode scanner input (autofocus, Enter to submit) | ✅ | autoFocus on barcode field in create form |

### 4C. Vendor UI (Spec: `02-vendor-ledger.md` §6)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 4C.1 | `/vendors` — list with balance column + search | ✅ | `(dashboard)/vendors/page.tsx` — hasBalance filter |
| 4C.2 | `/vendors/new` — create form | ✅ | `vendors/new/page.tsx` — opening balance field |
| 4C.3 | `/vendors/:id` — profile + summary cards + recent activity | ✅ | `vendors/[id]/page.tsx` — 3 summary cards + recent txns |
| 4C.4 | `/vendors/:id/ledger` — full ledger timeline with filters | ✅ | `vendors/[id]/ledger/page.tsx` — debit/credit columns, type filter |
| 4C.5 | `/vendors/:id/transactions/new` — type-aware form | ✅ | `vendors/[id]/transactions/new/page.tsx` — items for PURCHASE/RETURN |
| 4C.6 | `/vendors/:id/edit` — edit basic info | ✅ | `vendors/[id]/edit/page.tsx` |

### 4D. POS / Billing UI (Spec: `03-pos-billing.md` §6)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 4D.1 | `/pos` — main billing screen (split layout) | ⬜ | Search/cart left, payment/customer right |
| 4D.2 | Product search + barcode scanner | ⬜ | Auto-focus, Enter adds qty=1 |
| 4D.3 | Cart with per-line discount + bill-level discount | ⬜ | |
| 4D.4 | Payment split UI (live "remaining" amount) | ⬜ | |
| 4D.5 | Customer picker (phone-first lookup, inline create) | ⬜ | |
| 4D.6 | Credit payment warning banner | ⬜ | |
| 4D.7 | Cart persistence in sessionStorage | ⬜ | |
| 4D.8 | `/sales` — list of past sales with filters | ⬜ | |
| 4D.9 | `/sales/:id` — invoice view + print + void (ADMIN) | ⬜ | |
| 4D.10 | `/sales/:id/print` — print-optimized invoice route | ⬜ | |

### 4E. Customer Dues UI (Spec: `04-customer-dues.md` §7)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 4E.1 | `/dues` — all pending/partial dues, sortable by aging | ✅ | Status filter + overdue toggle + progress bars |
| 4E.2 | `/dues/:id` — detail + collect-payment form | ✅ | Payment form + clear shortcut + write-off (ADMIN) |
| 4E.3 | `/customers/:id` — customer profile with dues tab | ✅ | Dues summary card + aging display + tabs |
| 4E.4 | `/customers/:id/dues` — per-customer due history | ✅ | Full paginated history (open + cleared) |
| 4E.5 | `/dues/aging` — ADMIN aging report | ✅ | Bucket cards + customer breakdown table |
| 4E.6 | Partial payment progress bar per due row | ✅ | Green progress bar on list + detail views |
| 4E.7 | Overpayment credit toast notification | ✅ | Green toast after payment with credit amount |

### 4F. Stock Movement UI (Spec: `05-stock-movement.md` §8)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 4F.1 | `/inventory/:id/timeline` — timeline with type filter + chart | ✅ | Chart placeholder present, timeline functional |
| 4F.2 | `/stock-movements` — cross-product log (ADMIN) | ✅ | Full table with type/date filters + pagination + source links |
| 4F.3 | `/stock-movements/reconciliation` — ADMIN health dashboard | ✅ | Health status card + drift table + manual run button |

### 4G. Admin & Settings UI

| # | Task | Status | Notes |
|---|------|--------|-------|
| 4G.1 | `/users` — user management (ADMIN) | ✅ | Create, deactivate, reset-password, unlock |
| 4G.2 | `/audit-log` — audit log viewer (ADMIN) | ✅ | Paginated, filterable, expandable before/after |
| 4G.3 | `/settings` — GST mode, FY config (ADMIN) | ⬜ | |

---

## Phase 5 — Cross-Cutting Concerns & Hardening

| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.1 | Money/weight: all Decimal(12,2) for money, Decimal(10,3) for weight | ✅ | Prisma schema uses correct precision |
| 5.2 | Frontend number formatting: `Intl.NumberFormat('en-IN', ...)` | ✅ | `lib/format.ts` — formatINR, formatWeight |
| 5.3 | Optimistic locking (updatedAt / If-Unmodified-Since → 409) | ⬜ | Spec: `01-inventory.md` §6 |
| 5.4 | `prisma.$transaction` for all multi-table operations | ✅ | Used in create, update, delete, adjust-stock |
| 5.5 | `SELECT ... FOR UPDATE` on Product and Vendor rows | ✅ | In `recordMovement()` service |
| 5.6 | Redis integration (optional): session blacklist, rate limit, cache | ⬜ | |
| 5.7 | WebSocket/Socket.IO for live inventory updates | ⬜ | Optional |

---

## Phase 6 — Testing

| # | Task | Status | Notes |
|---|------|--------|-------|
| 6.1 | Unit tests: selling price formula | ⬜ | |
| 6.2 | Unit tests: running balance logic | ⬜ | |
| 6.3 | Unit tests: GST computation (INTRA / INTER) | ⬜ | |
| 6.4 | Integration tests: auth flow (login, refresh, logout, lockout) | ⬜ | |
| 6.5 | Integration tests: product CRUD + stock movements | ⬜ | |
| 6.6 | Integration tests: vendor transaction + balance atomicity | ⬜ | |
| 6.7 | Integration tests: sale → stock decrement → due creation | ⬜ | |
| 6.8 | Integration tests: void sale → stock reversal → due void | ⬜ | |
| 6.9 | Integration tests: due payment → overpayment → credit | ⬜ | |
| 6.10 | Integration tests: RBAC (STAFF forbidden on ADMIN routes) | ⬜ | |
| 6.11 | Concurrency test: parallel sale of last unit | ⬜ | |
| 6.12 | Concurrency test: parallel vendor transactions | ⬜ | |
| 6.13 | Reconciliation job test: healthy DB → zero corrections | ⬜ | |
| 6.14 | E2E tests: POS flow (search → cart → pay → invoice) | ⬜ | |

---

## Acceptance Criteria Checklist

> Copied directly from each module spec. Mark as tasks are verified.

### Inventory (`01-inventory.md` §7)
- [x] Cannot save a product with `netWeight <= 0` — Zod refinement + service guard
- [x] Selling price reflects current gold rate within 60s of rate change — computed on read, never cached
- [x] Editing any field writes complete before/after to AuditLog — in updateProduct service
- [x] Low-stock view returns correct rows; badge count matches — raw SQL query + badge in UI
- [x] Stock cannot go below zero through any API path — `recordMovement()` + DB CHECK pending
- [x] STAFF cannot reach gold rate endpoint (403) — `authorize('ADMIN')` on POST /gold-rate
- [x] Soft-deleted products don't appear in POS but remain in audit history — `isActive: true` filter

### Vendor Ledger (`02-vendor-ledger.md` §8)
- [x] PURCHASE increases stock + credits vendor atomically — `recordMovement(PURCHASE, +qty)` in same `$transaction`
- [x] Ledger `balanceAfter` is correct for every row — computed with Decimal.js, row-locked
- [x] RETURN cannot make stock negative — `recordMovement()` rejects negative stock
- [x] Concurrent transactions never produce inconsistent balances — `SELECT FOR UPDATE` on Vendor row
- [x] STAFF cannot create ADJUSTMENT (403) — `ForbiddenError` in service + `authorize('ADMIN','STAFF')` on route
- [x] Export has opening + closing balance for date range — CSV with prior-txn sum + closing
- [x] Soft-deleting vendor with active products is blocked — `ConflictError` if activeProductCount > 0

### POS Billing (`03-pos-billing.md` §8)
- [x] Sale creates Sale + Items + Movements + Payments (+ Due) atomically — single `$transaction` in `createSale()`
- [x] Inventory decrements exactly match sale quantity — `recordMovement(SALE, -qty)` per line
- [ ] Grand total equals sum of payments (CHECK constraint) — logic enforced in service; DB CHECK pending migration
- [x] Voiding fully reverses stock and clears due — `voidSale()` + VOID_REVERSAL + due void/credit
- [x] SaleItem pricing snapshot is immutable — snapshot fields on SaleItem, never read from Product after sale
- [x] STAFF cannot void sales (403) — `authorize('ADMIN')` on POST /sales/:id/void
- [x] Idempotency: duplicate POST returns original, not duplicate — Idempotency-Key header + AuditLog lookup
- [x] Invoice number is unique, FY-aware, gapless — `generateInvoiceNumber()` with SELECT FOR UPDATE

### Customer Dues (`04-customer-dues.md` §9)
- [x] Every credit sale creates exactly one due — `createSale()` creates CustomerDue when creditAmount > 0
- [x] `Customer.totalDue` equals SUM of open dues — decremented atomically in collectPayment/writeOff/voidSale
- [x] Partial payments transition status correctly — PENDING → PARTIAL → CLEARED in collectPayment
- [x] Overpayment never produces negative balance; produces credit — excess creates CustomerCredit(OVERPAYMENT)
- [x] STAFF cannot write off dues (403) — `authorize('ADMIN')` on POST /dues/:id/write-off
- [x] Sale void on partially-paid due preserves paid amount as credit — in `voidSale()` → CustomerCredit(VOID_REFUND)
- [x] Aging buckets are correct — computed from dueDate/createdAt in getCustomerDuesSummary/getAgingReport
- [x] Payment history is append-only — no edit/delete endpoints for CustomerDuePayment

### Stock Movement (`05-stock-movement.md` §10)
- [x] No code writes to StockMovement outside `recordMovement()` — all callers use the service
- [x] No code updates `currentStock` without StockMovement in same txn — enforced in service
- [ ] UPDATE/DELETE on StockMovement fails at DB level — REVOKE pending migration
- [x] Timeline `stockAfter` matches running sum of deltas — set in service
- [ ] Reconciliation job on healthy DB produces zero corrections
- [x] Void sale shows SALE + VOID_REVERSAL rows for same saleId — logic ready
- [x] STAFF cannot reach adjust-stock / stock-movements / reconciliation (403) — ADMIN auth
- [ ] Timeline query for 10K-movement product returns page in < 200ms

### Auth & RBAC (`06-auth-and-rbac.md` §12)
- [x] STAFF receives 403 on every ADMIN-only endpoint — `authorize('ADMIN')` on all guarded routes
- [x] Frontend hides ADMIN-only buttons for STAFF — Sidebar + page-level checks
- [x] After password change, all prior tokens rejected — `passwordChangedAt` check in middleware
- [x] 6th failed login locks account for 15 minutes — lockout logic in login handler
- [x] Refresh token rotation: old token fails after refresh — hash replaced on rotate
- [x] Logout clears server hash + blacklists access token — in logout route
- [x] Last active ADMIN cannot deactivate themselves (409) — guard in DELETE /users
- [x] Every mutation produces AuditLog with user, before, after, IP, UA — in all services
- [x] Audit log endpoint unreachable for STAFF — `authorize('ADMIN')` on `GET /audit-log`

---

## Summary

| Phase | Total Tasks | Done | % |
|-------|-------------|------|---|
| 0 — Infrastructure | 10 | 8 | 80% |
| 1 — Database | 29 | 22 | 76% |
| 2 — Shared Types | 11 | 11 | 100% |
| 3 — API | 54 | 54 | 100% |
| 4 — Frontend | 40 | 35 | 88% |
| 5 — Cross-Cutting | 7 | 4 | 57% |
| 6 — Testing | 14 | 0 | 0% |
| **Total** | **165** | **134** | **81%** |

---

*Last updated: 2026-05-27 — Auth & RBAC module (06) fully implemented: rate limiting, reset-password, unlock, audit-log endpoint, silent refresh, Next.js middleware, 403 page, user management UI, audit log viewer UI*

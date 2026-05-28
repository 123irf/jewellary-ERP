# 00 — System Architecture & Cross-Cutting Concerns

> **Read this before any module spec.** Every module below assumes the conventions defined here.

---

## 1. Tech Stack (Locked)

| Layer       | Choice                                          |
|-------------|-------------------------------------------------|
| Frontend    | Next.js 14+ (App Router), TypeScript, Tailwind  |
| Backend     | Node.js + Express (separate service)            |
| Database    | PostgreSQL 15+                                  |
| ORM         | Prisma                                          |
| Auth        | JWT (access + refresh), bcrypt for passwords    |
| API style   | REST, JSON, versioned at `/api/v1/...`          |
| Validation  | Zod (shared between FE/BE via a `packages/types` workspace) |
| Logging     | pino + pino-http                                |
| Migrations  | `prisma migrate`                                |

**Optional but recommended for prod:**
- Redis — session blacklist, rate limiting, POS cart state, low-stock cache
- Docker Compose — local Postgres + Redis + API + Web
- WebSockets (Socket.IO) — live inventory updates, low-stock alerts

---

## 2. Repo Layout (Monorepo)

```
/erp
├── apps/
│   ├── web/                 # Next.js
│   └── api/                 # Express
├── packages/
│   ├── types/               # Shared Zod schemas + TS types
│   └── db/                  # Prisma schema + client
├── docker-compose.yml
└── turbo.json
```

---

## 3. Domain Model — High Level

```
User ──┐
       │ (createdBy)
       ▼
   Product ◄── StockMovement ──► Vendor
       │                          │
       │ (line items)             │ (ledger entries)
       ▼                          ▼
     Sale ──► Payment       VendorTransaction
       │
       ▼
   Customer ◄── CustomerDue
```

**Key invariants enforced at DB + service layer:**
1. `Product.currentStock >= 0` — CHECK constraint + service guard
2. Every `StockMovement` row references a source (`SALE`, `PURCHASE`, `RETURN`, `ADJUSTMENT`, `AUDIT`)
3. Every `VendorTransaction` row updates `Vendor.runningBalance` inside the same transaction
4. Every `Sale` with `paymentMode = CREDIT` (full or split) creates a matching `CustomerDue` row in the same transaction

---

## 4. Auth & RBAC

### Roles
- `ADMIN` — full access, including delete, audit logs, ledger exports
- `STAFF` — create + read + update, **no delete**, no audit log access, no rate edits

### JWT structure
```json
{
  "sub": "user_id",
  "role": "ADMIN" | "STAFF",
  "iat": 1234567890,
  "exp": 1234567890
}
```
- Access token: 15 min
- Refresh token: 7 days, stored hashed in DB (`User.refreshTokenHash`)

### Middleware chain (every protected route)
```
requestId → pinoHttp → authenticate → authorize(role[]) → validate(zod) → handler
```

### Permission matrix (high level)
| Action                    | ADMIN | STAFF |
|---------------------------|-------|-------|
| Create product            | ✅    | ✅    |
| Edit product (non-rate)   | ✅    | ✅    |
| Edit gold rate            | ✅    | ❌    |
| Delete product            | ✅    | ❌    |
| Create sale               | ✅    | ✅    |
| Void sale                 | ✅    | ❌    |
| View audit log            | ✅    | ❌    |
| Create vendor             | ✅    | ✅    |
| Delete vendor             | ✅    | ❌    |
| Clear customer due        | ✅    | ✅    |
| Edit historical due       | ✅    | ❌    |

---

## 5. Audit Trail (Cross-Cutting)

A single `AuditLog` table captures every mutating action across all modules.

```prisma
model AuditLog {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  action     String   // "PRODUCT_UPDATE", "SALE_CREATE", "DUE_CLEAR", etc.
  entity     String   // "Product", "Sale", "VendorTransaction"
  entityId   String
  before     Json?    // snapshot before change (null for CREATE)
  after      Json?    // snapshot after change (null for DELETE)
  ipAddress  String?
  userAgent  String?
  createdAt  DateTime @default(now())

  @@index([entity, entityId])
  @@index([userId, createdAt])
}
```

**Implementation:** Prisma middleware (`$use`) intercepts every `create`/`update`/`delete` on whitelisted models and writes an `AuditLog` row in the same transaction.

---

## 6. Money & Numeric Precision

- **Never** use `Float` for money or weight. Use `Decimal` with explicit precision.
- Money: `Decimal(12, 2)` — rupees with paise
- Weight (grams): `Decimal(10, 3)` — to milligram precision
- Percentages (wastage, GST): `Decimal(5, 2)`

Frontend formats via `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`.

---

## 7. Error Envelope (All APIs)

**Success:**
```json
{ "ok": true, "data": { ... } }
```

**Error:**
```json
{
  "ok": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Cannot sell 3 units; only 2 in stock.",
    "details": { "productId": "...", "requested": 3, "available": 2 }
  }
}
```

Standard error codes:
`VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INSUFFICIENT_STOCK`, `NEGATIVE_BALANCE`, `INTERNAL_ERROR`.

---

## 8. Transactions

**Any operation touching ≥ 2 tables MUST run inside `prisma.$transaction`.** Examples:
- POS sale → `Sale` + `SaleItem[]` + `StockMovement[]` + `Payment[]` + optional `CustomerDue` + `AuditLog`
- Vendor return → `VendorTransaction` + `StockMovement` + `Product.currentStock` decrement
- Edit product → `Product` update + `AuditLog`

If any step fails, the entire operation rolls back. No partial state ever.

---

## 9. ID Strategy

- Use `cuid()` for all primary keys (sortable, URL-safe, no collision risk).
- Human-readable codes (`SKU`, `Sale.invoiceNumber`, `Vendor.code`) are separate fields, generated by sequence + format rule, unique-indexed.

---

## 10. Module Read Order

1. `01-inventory.md`
2. `02-vendor-ledger.md`
3. `03-pos-billing.md`
4. `04-customer-dues.md`
5. `05-stock-movement.md`
6. `06-auth-and-rbac.md`

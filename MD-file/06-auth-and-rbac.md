# 06 — Authentication & RBAC

> **Prerequisite:** Read `00-architecture.md`.

---

## 1. Purpose

Two roles, JWT-based auth, hard role boundaries enforced at three layers (DB, middleware, UI). Refresh tokens stored hashed, blacklistable via Redis. Audit log access strictly ADMIN.

---

## 2. Roles & Capability Summary

| Capability | ADMIN | STAFF |
|---|---|---|
| Login / logout / change password | ✅ | ✅ |
| Create user | ✅ | ❌ |
| Reset other users' password | ✅ | ❌ |
| View other users | ✅ | ❌ (sees only self) |
| Inventory: create / read / update | ✅ | ✅ |
| Inventory: delete (soft) | ✅ | ❌ |
| Inventory: set gold rate | ✅ | ❌ |
| Vendor: create / read / update | ✅ | ✅ |
| Vendor: delete | ✅ | ❌ |
| Vendor: ADJUSTMENT transaction | ✅ | ❌ |
| Vendor: ledger export | ✅ | ❌ |
| POS: create sale | ✅ | ✅ |
| POS: void sale | ✅ | ❌ |
| Dues: collect payments | ✅ | ✅ |
| Dues: write-off | ✅ | ❌ |
| Dues: aging report | ✅ | ❌ |
| Stock: adjust manually | ✅ | ❌ |
| Stock: cross-product feed | ✅ | ❌ |
| Stock: reconciliation view | ✅ | ❌ |
| Audit log: view | ✅ | ❌ |
| Settings (GST mode, FY config) | ✅ | ❌ |

**The rule of thumb:** STAFF moves the business forward (sells, restocks, collects). ADMIN governs (deletes, adjusts, reports, audits).

---

## 3. Database Schema (Prisma)

```prisma
enum UserRole {
  ADMIN
  STAFF
}

model User {
  id                String     @id @default(cuid())
  name              String
  email             String     @unique
  passwordHash      String
  role              UserRole

  isActive          Boolean    @default(true)
  failedLoginCount  Int        @default(0)
  lockedUntil       DateTime?

  refreshTokenHash  String?    // current valid refresh token, bcrypt-hashed
  lastLoginAt       DateTime?
  passwordChangedAt DateTime   @default(now())

  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt
  createdById       String?
  createdBy         User?      @relation("UserCreator", fields: [createdById], references: [id])
  createdUsers      User[]     @relation("UserCreator")

  // Inverse relations
  products          Product[]  @relation("ProductCreator")
  sales             Sale[]
  vendorTxns        VendorTransaction[]
  duePayments       CustomerDuePayment[]
  stockMovements    StockMovement[]
  goldRates         GoldRate[]
  auditLogs         AuditLog[]

  @@index([email])
  @@index([role, isActive])
}
```

---

## 4. Token Strategy

### Access token (JWT)
- Algorithm: `HS256` (single API service, no need for asymmetric)
- Secret: 64-byte random, stored in env (`JWT_ACCESS_SECRET`)
- Expiry: **15 minutes**
- Payload:
  ```json
  {
    "sub": "user_id",
    "role": "ADMIN",
    "name": "Anjali",
    "iat": 1234567890,
    "exp": 1234568790
  }
  ```
- Stored client-side in memory (Zustand store, hydrated on app load). **Not** in localStorage.

### Refresh token
- Opaque random 32-byte string (not a JWT)
- Expiry: **7 days**
- Hashed (bcrypt, cost 10) and stored in `User.refreshTokenHash`. Only the most recent one is valid — refresh rotation invalidates the prior.
- Delivered as `httpOnly`, `Secure`, `SameSite=Strict` cookie.

### Logout
- Server clears `User.refreshTokenHash` and adds current JTI to Redis blacklist (TTL = remaining access token life). Cookie cleared.

### Refresh flow
```
POST /api/v1/auth/refresh
  - Read refresh cookie
  - bcrypt.compare against User.refreshTokenHash
  - If valid: issue new access + new refresh (rotation), update hash
  - If invalid: 401 + clear cookie
```

---

## 5. Lockout & Brute-Force Protection

- 5 failed login attempts → lock account for 15 minutes (`lockedUntil`)
- Reset counter on successful login
- Per-IP rate limit on `/auth/login`: 10 attempts / 5 min (Redis-backed, fall back to in-memory)
- Optional: CAPTCHA after 3 failures (out of scope for v1)

---

## 6. Password Rules

- Min 10 chars, must contain letter + digit + symbol
- Bcrypt hash, cost 12
- `passwordChangedAt` tracked; any token issued before this timestamp is invalid (server-side check on each request)
- Forgot-password flow: token emailed, 30-min expiry, single-use (out of scope for v1, but schema reserves space via `User.passwordResetToken` if you choose to add)

---

## 7. API Contracts

Mounted under `/api/v1/auth` and `/api/v1/users`.

### `POST /auth/login`
**Body:** `{ email, password }`
**Response (200):**
```json
{
  "ok": true,
  "data": {
    "accessToken": "eyJ...",
    "user": { "id": "...", "name": "...", "role": "ADMIN" }
  }
}
```
Sets `refreshToken` cookie.

### `POST /auth/refresh`
Reads cookie, rotates, returns new access token.

### `POST /auth/logout`
Clears server-side refresh hash + blacklists current access token JTI. Returns 204.

### `POST /auth/change-password`
**Auth required.** Body: `{ currentPassword, newPassword }`. Updates `passwordChangedAt`, forces all other sessions to re-login.

### `POST /users` — Create user
**Role:** ADMIN only
**Body:** `{ name, email, password, role }`

### `GET /users` — List
**Role:** ADMIN only

### `PATCH /users/:id` — Edit
**Role:** ADMIN only (or self for name only)

### `POST /users/:id/reset-password`
**Role:** ADMIN only. Returns temporary password; user must change on next login (`mustChangePassword` flag — add to schema if implementing).

### `DELETE /users/:id` — Deactivate
**Role:** ADMIN only. Soft via `isActive = false`. Cannot deactivate the last ADMIN (server check).

### `GET /audit-log`
**Role:** ADMIN only
**Query:** `entity`, `entityId`, `userId`, `from`, `to`, `action`, `page`, `pageSize`
Returns paginated `AuditLog` rows with user info joined.

---

## 8. Middleware Stack

```ts
// apps/api/src/middleware/index.ts

export const authenticate = (req, res, next) => {
  // 1. Read Bearer token
  // 2. jwt.verify with JWT_ACCESS_SECRET
  // 3. Check blacklist in Redis
  // 4. Load user (cached 60s) — verify isActive, verify token.iat >= user.passwordChangedAt
  // 5. Attach req.user
};

export const authorize = (...roles: UserRole[]) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: '...' } });
  }
  next();
};

export const auditLog = (action: string, entity: string) => (req, res, next) => {
  // Captures before/after via Prisma middleware in services; this just sets req.auditContext
};
```

Route example:
```ts
router.delete(
  '/products/:id',
  authenticate,
  authorize('ADMIN'),
  validate(deleteProductSchema),
  productsController.softDelete,
);
```

---

## 9. Frontend RBAC

### Storage
- Access token in Zustand memory store, refreshed silently in a background interval (every 13 min) and on 401 responses.
- Role attached to every route via Next.js middleware.

### Route protection
```ts
// middleware.ts
export async function middleware(req: NextRequest) {
  const token = await getToken(req);

  if (!token && !PUBLIC_ROUTES.includes(req.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (ADMIN_ROUTES.some(p => req.nextUrl.pathname.startsWith(p)) && token.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/403', req.url));
  }
}
```

`ADMIN_ROUTES` includes:
`/audit-log`, `/users`, `/dues/aging`, `/stock-movements`, `/inventory/gold-rate`, `/sales/*/void`, `/settings`.

### UI hiding
- Hide ADMIN-only buttons in shared screens via `useUser().role === 'ADMIN'` check.
- Always pair UI hiding with server-side authorization — UI is for UX, server is for security.

---

## 10. Audit Log Coverage Matrix

Every endpoint that mutates state writes one `AuditLog` row. The Prisma middleware on the API side handles this automatically for whitelisted models.

| Module | Tracked actions |
|---|---|
| Auth | `LOGIN`, `LOGOUT`, `PASSWORD_CHANGE`, `PASSWORD_RESET` |
| Users | `USER_CREATE`, `USER_UPDATE`, `USER_DEACTIVATE`, `ROLE_CHANGE` |
| Inventory | `PRODUCT_CREATE`, `PRODUCT_UPDATE`, `PRODUCT_DELETE`, `GOLD_RATE_SET`, `STOCK_ADJUST` |
| Vendors | `VENDOR_CREATE`, `VENDOR_UPDATE`, `VENDOR_DELETE`, `VENDOR_TXN_CREATE`, `VENDOR_ADJUSTMENT` |
| POS | `SALE_CREATE`, `SALE_VOID` |
| Dues | `DUE_PAYMENT`, `DUE_CLEAR`, `DUE_WRITE_OFF` |

Audit log is itself **append-only** — same DB-permission lockdown as `StockMovement`.

---

## 11. Edge Cases & Failure Modes

| Case | Behavior |
|------|----------|
| ADMIN deactivates self | Allowed only if another active ADMIN exists |
| User changes role mid-session | Existing tokens still carry old role until next refresh; mitigation: short access token life + role check on each request against fresh user record (already covered by `passwordChangedAt` check, extend with `permissionsChangedAt`) |
| Refresh token reuse (stolen) | Rotation invalidates old hash; subsequent reuse fails. Optional: detect reuse and force logout-all by clearing all refresh hashes |
| Clock skew between API and DB | Tokens use server-issued `iat`/`exp`; no client clock involvement |
| Account locked, ADMIN wants to unlock | `POST /users/:id/unlock` (ADMIN only) clears `lockedUntil` and `failedLoginCount` |
| First-ever user | Seed script creates one ADMIN via env vars during initial migration; no public registration endpoint exists |
| JWT secret rotation | All sessions invalidated; communicated to users via maintenance window |
| Audit log table grows huge | Partition by month after 6 months; old partitions can be moved to cold storage |

---

## 12. Acceptance Criteria

- [ ] STAFF receives 403 on every endpoint listed as ADMIN-only.
- [ ] Frontend hides ADMIN-only buttons for STAFF users.
- [ ] After password change, all prior access tokens are rejected on next request.
- [ ] 6th consecutive failed login locks the account for 15 minutes.
- [ ] Refresh token rotation: old refresh token fails after a successful refresh call.
- [ ] Logout clears server-side refresh hash and blacklists current access token.
- [ ] Last active ADMIN cannot deactivate themselves (409).
- [ ] Every mutation across modules produces a corresponding `AuditLog` row with user, before, after, IP, and UA.
- [ ] Audit log endpoint is unreachable for STAFF.

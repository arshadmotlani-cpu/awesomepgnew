# FYHAIR RBAC Audit

Audit date: 2026-09-12. Source: repository code inspection (routes, actions, services, workforce permissions).

## Summary

FYHAIR runs **two parallel permission systems**:

| Layer | Location | Keys | Enforcement |
|-------|----------|------|-------------|
| Legacy Hair | `src/hair/lib/auth/permissionTypes.ts` | 16 `page:*` + 7 `action:*` | Layout guard, most hair actions |
| Workforce RBAC | `src/workforce/permissions/library.ts` | 67 boolean keys | `requireWorkforcePermission`, workforce actions |

Bridge: `src/workforce/compat/hairAdminBridge.ts` maps workforce grants → legacy keys (lossy).

**Critical gap:** `src/hair/services/*` (~48 modules) have **no auth checks** — enforcement is action/route only.

---

## Identity & tenant

| Concept | Table / module |
|---------|----------------|
| Platform user | `platform.users` |
| Legacy admin | `fyh_admin_users` |
| Workforce employee (auth) | `wf_employees` (`can_login`) |
| Operational staff (booking FK) | `fyh_staff` |
| Tenant context | `resolveTenantContext.ts`, session org/location |

---

## Routes (`app/(hair)/fyh`) — 96 page routes

### Global guards

- `(app)/layout.tsx` → `requirePagePermissionForPath` (legacy `page:*`)
- Exempt: `/profile`, `/access-denied`
- `(public)/layout.tsx` → none

### Module mapping (layout permission)

| Path prefix | Layout key | Notes |
|-------------|------------|-------|
| `/dashboard` | `page:dashboard` | Revenue/staff sub-pages have extra guards |
| `/customers` | `page:customers` | |
| `/appointments` | `page:appointments` | |
| `/billing`, `/advance-payment` | `page:billing` | |
| `/quick-sale` | `page:quick_sale` | |
| `/inventory`, `/vendors` | `page:inventory` | |
| `/purchases` | `page:purchases` | |
| `/expenses` | `page:expenses` | `/expenses/salary` adds `requireHairHost` |
| `/reports` | `page:reports` | |
| `/settings` | `page:settings` | `/settings/permissions` → `permissions.manage` |
| `/services` | `page:services` | |
| `/packages` | `page:packages` | |
| `/memberships`, `/membership-packages` | `page:memberships` | |
| `/products` | `page:settings` | |
| `/staff`, `/team`, `/workforce` | `page:dashboard` | Weak — relies on action guards |
| `/attendance` | `page:appointments` | + `requireHairHost` |
| `/loyalty` | `page:customers` | |
| `/me` | `page:appointments` | + `requireHairHost` only |

### Public / unguarded

- `/auth/login`, `/invoice/[n]`, `/i/[n]`, `/salon-software`, `/brand-concepts`
- `saasWaitlist` action — no auth

---

## Hair actions (`src/hair/actions/`) — guard status

| File | Guard | Gap |
|------|-------|-----|
| `customers.ts` | `page:customers` | No field-level PII gates |
| `quickSale.ts` | `page:quick_sale`, `action:billing.checkout` | No POS granular keys |
| `appointments.ts` | `page:appointments`, checkout | No own vs all scope |
| `packages.ts` | `page:packages`, `action:packages.edit` | `listAvailable*` auth-only |
| `loyalty.ts` | **`requireHairAuth` only** | Missing granular keys |
| `services.ts` | **`requireHairAuth` only** | |
| `products.ts` | Mixed auth-only / inventory | |
| `staffSchedules.ts` | **`requireHairAuth` only** | |
| `search.ts` | **`requireHairAuth` only** | |
| `reports.ts` | `action:reports.export` | No per-report-type |
| `settings.ts` | `action:settings.edit` | |
| `inventory.ts` | `page:inventory`, `action:inventory.adjust` | |
| `invoiceRegister.ts` | `page:billing` | |
| `expenses.ts` | `page:expenses` | |
| `financialDashboard.ts` | `page:dashboard` | |
| `staffPerformanceExport.ts` | `page:dashboard_staff` | |
| `advancePayment.ts` | `page:billing`, checkout | |
| `historicalImport.ts` | `requireSuperAdmin` | |
| `team.ts` | SaaS platform roles | Separate from workforce |

---

## Workforce actions — guard status

| File | Keys used |
|------|-----------|
| `attendance.ts` | `attendance.mark`, `attendance.correct`, `attendance.manage_office`, `attendance.view_own`, `attendance.view_team` |
| `employees.ts` | `staff.add`, `staff.edit`, `staff.view_financials` |
| `payroll.ts` | `finance.view_salary`, `finance.pay_salary`, `finance.view_own_salary` |
| `permissions.ts` | `permissions.manage` |
| `operations.ts` | `staff.edit`, `finance.manage_salary` |

---

## API routes

| Path | Auth | Gap |
|------|------|-----|
| `/api/search` | Session | No module key |
| `/api/quick-sale/customers` | Session | No `quick_sale.customer.search` |
| `/api/staff/qr` | Session | **No `finance.view_salary_qr`** |
| `/api/invoices/[id]/print` | `page:billing` | |
| `/api/invoices/public/[n]/print` | None (public token) | By design |
| `/api/office-location/geocode` | `attendance.manage_office` | |

---

## Services layer

All 48 modules in `src/hair/services/` — **zero runtime permission checks**. Tenant scoping only.

High-risk services for boundary guards:

- `customers.ts` — PII
- `invoices.ts`, `quickSale.ts` — financial
- `staffPerformance*.ts` — commission
- Workforce `employees.ts`, `payroll.ts` — salary/banking

---

## Sensitive fields

### Customers (`fyh_customers`)

`phone`, `whatsapp`, `email`, `dateOfBirth`, `address`, `allergies`, `notes`, `walletPaise`, package credits

### Workforce employees (`wf_employees`)

`aadhaarNumber`, `panNumber`, `salaryPaise`, `bankAccount*`, `upiId`, `qrCodeUrl`, `passwordHash`

### Payroll

`salaryPaise`, `commissionPaise`, `netPaise`, payment references — QR nulled unless `finance.view_salary_qr`

---

## Existing workforce keys (67)

See `src/workforce/permissions/library.ts`. Groups: dashboard, customers, appointments, billing, products, services, packages, memberships, inventory, staff, reports, loyalty, settings, configuration, calendar, cash_drawer, expenses, analytics, records, approvals, permissions, ecosystem.

---

## Additional Rights (13 keys — insufficient)

`finance.view_salary`, `finance.manage_salary`, `finance.pay_salary`, `finance.view_salary_qr`, `finance.view_own_salary`, `attendance.view_team`, `attendance.correct`, `attendance.manage_office`, `payroll.view_reports`, `staff.view_financials`, `staff.add`, `staff.edit`, `staff.view`

---

## Target state (v2)

- Single SSOT: `src/workforce/permissions/` with MODULE → RESOURCE → ACTION → SCOPE
- `requireFyhPermission` at actions + service boundary
- Field projection for PII/banking
- Per-report and per-payment-method grants
- Quick Sale granular keys separate from billing
- Package sell vs redeem permissions separate

See implementation in `src/workforce/permissions/catalogV2.ts`, `aliases.ts`, `scope.ts`, `guards.ts`.

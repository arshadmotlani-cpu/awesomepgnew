# FYHAIR / SOFT Salon Software — Complete Architecture Audit

> **Audit date:** 2026-10-04 · **Mode:** read-only (no application code changes)
> **Purpose:** Full extracted architecture package for building the definitive Salon Brain graph.

> **Product naming (2026):** **For Your Technologies** = company; **Salon Software** = product; **FYHAIR** = reference salon / current tenant — not the product name. See [`TERMINOLOGY.md`](./TERMINOLOGY.md). Audit filename and `fyh_*` identifiers are unchanged legacy labels.

> **Companion:** [`FYHAIR-GRAPH-DATA.md`](./FYHAIR-GRAPH-DATA.md) · Executive brain: [`FYHAIR-SALON-BRAIN.md`](./FYHAIR-SALON-BRAIN.md)

Verified against: product-brain docs, `docs/SAAS_READINESS.md`, `docs/foryourhair/*`, `docs/BUGS.md`, and repository routes/schema/services (2026-10-04 pass).

---

## PART 1 — PRODUCT IDENTITY

### Names and positioning (code/docs supported only)

| Concept | Value | Evidence |
|---------|-------|----------|
| **Public brand** | **SOFT** / **FYHAIR** / **For Your Hair** | `docs/product-brain/FYHAIR-SALON-BRAIN.md`, marketing routes `/salon-software` |
| **Product type** | Salon ERP / POS / workforce — multi-module operating system | `src/hair/*`, `app/(hair)/fyh/*` |
| **Internal code names** | `hair`, `fyh`, `foryourhair`, engine id `fyh_salon` | paths, `src/workforce/types.ts` |
| **What it is** | Next.js salon tenant application + Workforce HR in same Hair DB; Platform admin for FYTECH multi-org scaffolding | ECOSYSTEM inventory, SAAS_READINESS |
| **Problem solved** | Single-salon (today) operations: CRM, calendar, billing/POS, inventory, expenses, reports, staff attendance | FEATURES.md, nav.ts |
| **Who uses it** | Salon owners, managers, reception, billers, stylists (operational FK), employees (workforce login), FYTECH platform admins | RBAC_AUDIT, roles section below |
| **Where it runs** | Vercel-hosted Next.js monorepo; **Hair host** middleware routing | `src/hair/lib/host.ts`, `middleware.ts` |
| **Hair database** | PostgreSQL via `HAIR_DATABASE_URL` — all `fyh_*` + `wf_*` | `src/hair/db/client.ts` |
| **Platform database** | PostgreSQL via `PLATFORM_DATABASE_URL` — `platform.*` schema | `src/platform/db/schema/index.ts` |

### Layer separation

| Layer | Scope | Legacy? |
|-------|-------|---------|
| **FYTECH Platform** | Orgs, locations, plans, subscriptions, invites, Stripe webhook | New SaaS scaffolding |
| **Salon tenant app** | Day-to-day salon modules on Hair host | Core product |
| **Workforce Engine** | `src/workforce/*`, `wf_*` tables in **Hair DB** | Phase 1 co-located; not separate DB |
| **Legacy Hair admin** | `fyh_admin_users`, `fyh_auth_sessions`, `page:*` permissions | Coexists; bridged at session |
| **Customer/public** | `/invoice`, `/i`, `/salon-software`, `/subscribe`, `/brand-concepts` | Public routes on Hair host |
| **Employee-facing** | `/me`, `/attendance`, `/workforce/home` | Workforce session |
| **PG / Capital** | Separate products; Hair middleware bypass for PG paths on shared deployment | Not salon software |

Production posture: **single-tenant For Your Hair live**; **multi-tenant SaaS unsafe** until `FYH_SAAS_TENANT=1` + migration parity (`docs/SAAS_READINESS.md`).

---

## PART 2 — COMPLETE SURFACE MAP

**Total surfaces inventoried:** 123 (96 page routes + APIs + platform + marketing).

| ID | Name | Route | Host | User | Auth | Permission | Status |
|----|------|-------|------|------|------|------------|--------|
| S-001 | Revenue dashboard | `/dashboard/revenue` | Hair host (fyhair.* / {slug}.fyhair.app) | Salon staff | Hair session | page:dashboard_revenue + layout page:dashboard | working |
| S-002 | Staff performance dashboard | `/dashboard/staff-performance` | Hair | Salon staff | Hair session | page:dashboard_staff | working |
| S-003 | Front desk dashboard | `/dashboard/front-desk` | Hair | Front desk roles | Hair session | page:dashboard (front desk nav profile) | working |
| S-004 | Dashboard redirect | `/dashboard` | Hair | Staff | Hair session | page:dashboard | working |
| S-005 | Landing (post-login) | `/landing` | Hair | Staff | Hair session | varies | unclear |
| S-006 | Customers list | `/customers` | Hair | Staff | Hair session | page:customers | working |
| S-007 | Customer detail | `/customers/[id]` | Hair | Staff | Hair session | page:customers | working |
| S-008 | New customer | `/customers/new` | Hair | Staff | Hair session | page:customers | working |
| S-009 | Appointments calendar | `/appointments` | Hair | Staff | Hair session | page:appointments | working |
| S-010 | Billing hub | `/billing` | Hair | Staff | Hair session | page:billing | working |
| S-011 | Invoice register | `/billing/invoices` | Hair | Staff | Hair session | page:billing | working |
| S-012 | Invoice detail | `/billing/[invoiceId]` | Hair | Staff | Hair session | page:billing | working |
| S-013 | Quick Sale POS | `/quick-sale` | Hair | Cashier/biller | Hair session | page:quick_sale (hidden nav; 9-dot Express Sale) | working |
| S-014 | Advance payment | `/advance-payment` | Hair | Staff | Hair session | page:billing + action:billing.checkout (modal via 9-dot) | working |
| S-015 | Staff roster | `/staff` | Hair | Managers | Hair session | page:staff (layout uses page:dashboard — weak) | partial |
| S-016 | Staff detail (legacy id) | `/staff/[employeeId]` | Hair | Managers | Hair session | page:dashboard weak | partial |
| S-017 | Staff performance (per staff) | `/staff/[id]/performance` | Hair | Managers | Hair session | page:dashboard weak | working |
| S-018 | Staff performance hub | `/staff/performance` | Hair | Managers | Hair session | page:dashboard weak | working |
| S-019 | Self attendance | `/attendance` | Hair | Employees | Hair session + requireHairHost | page:appointments | working |
| S-020 | Team attendance manage | `/attendance/manage` | Hair | Managers | Hair session + requireHairHost | page:dashboard | working |
| S-021 | Attendance map | `/attendance/map` | Hair | Managers | Hair session | page:dashboard | partial |
| S-022 | Purchases ERP | `/purchases` | Hair | Inventory/purchasing | Hair session | page:purchases | working |
| S-023 | New purchase ERP | `/purchases/new` | Hair | Staff | Hair session | page:purchases | working |
| S-024 | Purchase detail ERP | `/purchases/[id]` | Hair | Staff | Hair session | page:purchases | working |
| S-025 | Purchase edit ERP | `/purchases/[id]/edit` | Hair | Staff | Hair session | page:purchases | working |
| S-026 | Expenses | `/expenses` | Hair | Staff | Hair session | page:expenses | working |
| S-027 | Salary expenses | `/expenses/salary` | Hair | Owner/host-guarded | Hair session + requireHairHost | page:expenses | working |
| S-028 | Loyalty hub | `/loyalty` | Hair | Staff | Hair session | page:customers | partial |
| S-029 | Memberships config | `/memberships` | Hair | Admin | Hair session | page:memberships | working |
| S-030 | Packages config | `/packages` | Hair | Admin | Hair session | page:packages | working |
| S-031 | Membership-packages alias | `/membership-packages` | Hair | Admin | Hair session | page:memberships | duplicate route |
| S-032 | Services catalog | `/services` | Hair | Admin | Hair session | page:services | working |
| S-033 | Service detail | `/services/[id]` | Hair | Admin | Hair session | page:services | working |
| S-034 | New service | `/services/new` | Hair | Admin | Hair session | page:services | working |
| S-035 | Products catalog | `/products` | Hair | Admin | Hair session | page:settings (not page:products) | working |
| S-036 | Product detail | `/products/[id]` | Hair | Admin | Hair session | page:settings | working |
| S-037 | New product | `/products/new` | Hair | Admin | Hair session | page:settings | working |
| S-038 | Reports overview | `/reports` | Hair | Admin | Hair session | page:reports | working |
| S-039 | Daily revenue report | `/reports/revenue/daily` | Hair | Admin | Hair session | page:reports | working |
| S-040 | Monthly revenue report | `/reports/revenue/monthly` | Hair | Admin | Hair session | page:reports | working |
| S-041 | Yearly revenue report | `/reports/revenue/yearly` | Hair | Admin | Hair session | page:reports | working |
| S-042 | Staff metric reports | `/reports/staff/[metric]` | Hair | Admin | Hair session | page:reports | working |
| S-043 | Inventory products report | `/reports/inventory/products` | Hair | Admin | Hair session | page:reports | working |
| S-044 | Stock movement report | `/reports/inventory/stock` | Hair | Admin | Hair session | page:reports | working |
| S-045 | Low stock report | `/reports/inventory/low-stock` | Hair | Admin | Hair session | page:reports | working |
| S-046 | Customer loyalty report | `/reports/customers/loyalty` | Hair | Admin | Hair session | page:reports | partial |
| S-047 | Customer memberships report | `/reports/customers/memberships` | Hair | Admin | Hair session | page:reports | working |
| S-048 | Customer packages report | `/reports/customers/packages` | Hair | Admin | Hair session | page:reports | working |
| S-049 | GST report | `/reports/finance/gst` | Hair | Admin | Hair session | page:reports | working |
| S-050 | Payments report | `/reports/finance/payments` | Hair | Admin | Hair session | page:reports | working |
| S-051 | Discounts report | `/reports/finance/discounts` | Hair | Admin | Hair session | page:reports | working |
| S-052 | Settings hub | `/settings` | Hair | Admin | Hair session | page:settings | working |
| S-053 | Salon settings | `/settings/salon` | Hair | Admin | Hair session | page:settings + action:settings.edit | working |
| S-054 | GST invoice settings | `/settings/gst-invoice` | Hair | Admin | Hair session | page:settings | working |
| S-055 | Billing settings | `/settings/billing` | Hair | Admin | Hair session | page:settings | working |
| S-056 | Inventory settings | `/settings/inventory` | Hair | Admin | Hair session | page:settings | working |
| S-057 | Printer settings | `/settings/printer` | Hair | Admin | Hair session | page:settings | working |
| S-058 | WhatsApp settings | `/settings/whatsapp` | Hair | Admin | Hair session | page:settings | partial |
| S-059 | Communication settings | `/settings/communication` | Hair | Admin | Hair session | page:settings | partial |
| S-060 | Appearance settings | `/settings/appearance` | Hair | Admin | Hair session | page:settings | partial |
| S-061 | Attendance settings | `/settings/attendance` | Hair | Admin | Hair session | page:settings | working |
| S-062 | Permissions settings | `/settings/permissions` | Hair | Super/admin | Hair session | permissions.manage (workforce) | working |
| S-063 | Security settings | `/settings/security` | Hair | Admin | Hair session | page:settings | partial |
| S-064 | Historical import | `/settings/historical-import` | Hair | Super admin | requireSuperAdmin | action:import.historical | working |
| S-065 | Inventory hub | `/inventory` | Hair | Admin | Hair session | page:inventory | working |
| S-066 | Stock levels | `/inventory/stock` | Hair | Admin | Hair session | page:inventory | working |
| S-067 | Stock movements | `/inventory/movements` | Hair | Admin | Hair session | page:inventory | working |
| S-068 | Stock adjustments list | `/inventory/adjustments` | Hair | Admin | Hair session | page:inventory | working |
| S-069 | New adjustment | `/inventory/adjustments/new` | Hair | Admin | Hair session | page:inventory + action:inventory.adjust | working |
| S-070 | On-floor stock | `/inventory/on-floor` | Hair | Admin | Hair session | page:inventory | partial |
| S-071 | Inventory transfers | `/inventory/transfers` | Hair | Admin | Hair session | page:inventory | placeholder |
| S-072 | Legacy PO purchases list | `/inventory/purchases` | Hair | Admin | Hair session | page:inventory | partial |
| S-073 | Legacy PO detail | `/inventory/purchases/[id]` | Hair | Admin | Hair session | page:inventory | partial |
| S-074 | Legacy PO new | `/inventory/purchases/new` | Hair | Admin | Hair session | page:inventory | partial |
| S-075 | ERP vendors list (inventory path) | `/inventory/vendors` | Hair | Admin | Hair session | page:inventory | partial |
| S-076 | ERP vendor detail (inventory path) | `/inventory/vendors/[id]` | Hair | Admin | Hair session | page:inventory | partial |
| S-077 | ERP vendor new (inventory path) | `/inventory/vendors/new` | Hair | Admin | Hair session | page:inventory | partial |
| S-078 | Top-level vendors | `/vendors` | Hair | Admin | Hair session | page:inventory | working |
| S-079 | Vendor new | `/vendors/new` | Hair | Admin | Hair session | page:inventory | working |
| S-080 | Vendor detail | `/vendors/[id]` | Hair | Admin | Hair session | page:inventory | working |
| S-081 | Vendor edit | `/vendors/[id]/edit` | Hair | Admin | Hair session | page:inventory | working |
| S-082 | Workforce home | `/workforce/home` | Hair | Employees | Hair session | page:dashboard weak | working |
| S-083 | Workforce index | `/workforce` | Hair | Staff | Hair session | page:dashboard weak | partial |
| S-084 | Workforce operations | `/workforce/operations` | Hair | HR/owner | Hair session | workforce ops permissions | partial |
| S-085 | Employee portal /me | `/me` | Hair | Employees | Hair session + requireHairHost | page:appointments | working |
| S-086 | Platform team (org invites) | `/team` | Hair | Org owners | Hair session + platform membership | page:dashboard weak | working |
| S-087 | Team member detail | `/team/[memberId]` | Hair | Org owners | Hair session | page:dashboard weak | working |
| S-088 | Profile | `/profile` | Hair | Any authenticated | Hair session | exempt from page map | working |
| S-089 | Access denied | `/access-denied` | Hair | Any | Hair session | n/a | working |
| S-090 | Salon login | `/auth/login` | Hair | Staff | none | n/a | working |
| S-091 | Org picker | `/select-organization` | Hair | Staff | Hair session | FYH_SAAS_TENANT gated | partial |
| S-092 | Public invoice (long URL) | `/invoice/[invoiceNumber]` | Hair/public | Customer/public | none | public lookup + tenant risk | working |
| S-093 | Public invoice short | `/i/[invoiceNumber]` | Hair/public | Customer/public | none | same as S-092 | working |
| S-094 | Salon software marketing | `/salon-software` | Hair/public | Lead | none | n/a | working |
| S-095 | Subscribe marketing | `/subscribe` | Hair/public | Lead | none | n/a | working |
| S-096 | Brand concepts | `/brand-concepts` | Hair/public | Public | none | n/a | working |
| S-097 | Global search API | `/fyh/api/search` | Hair | Staff | Hair session (route handler) | requireHairAuth in handler | working |
| S-098 | Quick Sale customers API | `/fyh/api/quick-sale/customers` | Hair | Staff | Hair session | quick sale | working |
| S-099 | Invoice print (auth) | `/fyh/api/invoices/[invoiceId]/print` | Hair | Staff | Hair session | billing | working |
| S-100 | Public invoice print | `/fyh/api/invoices/public/[invoiceNumber]/print` | Hair/public | Public | token/number lookup | public | working |
| S-101 | Office geocode API | `/fyh/api/office-location/geocode` | Hair | Staff | Hair session | settings | working |
| S-102 | Staff QR API | `/fyh/api/staff/qr` | Hair | Staff | Hair session | attendance | working |
| S-103 | Select org bind | `/fyh/select-organization/bind` | Hair | Staff | Hair session | SaaS | partial |
| S-104 | Vendor statement PDF | `/api/hair/vendors/[id]/statement/pdf` | Any host with auth | Staff | Hair session | vendor permissions | working |
| S-105 | Vendor files | `/api/hair/vendor-files` | Hair | Staff | Hair session | inventory | working |
| P-001 | Platform admin home | `/platform/admin` | Platform host/path | Platform admin | Platform session | platform admin membership | working |
| P-002 | Platform organizations | `/platform/admin/organizations` | Platform | Platform admin | Platform session | admin | working |
| P-003 | Platform org detail | `/platform/admin/organizations/[id]` | Platform | Platform admin | Platform session | admin | working |
| P-004 | Platform org members | `/platform/admin/organizations/[id]/members` | Platform | Platform admin | Platform session | admin | working |
| P-005 | Platform org locations | `/platform/admin/organizations/[id]/locations` | Platform | Platform admin | Platform session | admin | working |
| P-006 | Platform new org | `/platform/admin/organizations/new` | Platform | Platform admin | Platform session | admin | working |
| P-007 | Platform locations | `/platform/admin/locations` | Platform | Platform admin | Platform session | admin | working |
| P-008 | Platform users | `/platform/admin/users` | Platform | Platform admin | Platform session | admin | working |
| P-009 | Platform subscriptions | `/platform/admin/subscriptions` | Platform | Platform admin | Platform session | admin | working |
| P-010 | Platform plans | `/platform/admin/plans` | Platform | Platform admin | Platform session | admin | working |
| P-011 | Platform payment submissions | `/platform/admin/payment-submissions` | Platform | Platform admin | Platform session | admin | working |
| P-012 | Platform onboarding | `/platform/admin/onboarding` | Platform | Platform admin | Platform session | admin | working |
| P-013 | Platform activity | `/platform/admin/activity` | Platform | Platform admin | Platform session | admin | working |
| P-014 | Platform search | `/platform/admin/search` | Platform | Platform admin | Platform session | admin | working |
| P-015 | Platform dashboard | `/platform/dashboard` | Platform | Platform user | Platform session | membership | working |
| P-016 | Platform login | `/platform/auth/login` | Platform | User | none | n/a | working |
| P-017 | Accept invite | `/platform/auth/accept-invite` | Platform | Invited user | token | invitation | working |
| P-018 | Stripe webhook | `/api/platform/stripe/webhook` | Platform API | Stripe | webhook secret | n/a | working |

### Surface detail template (major modules)

For each surface, the implementation stack follows: **RSC page** under `app/(hair)/fyh/**` → **layout guard** (`requirePagePermissionForPath` in `(app)/layout.tsx`) → **server actions** in `src/hair/actions/*` or **workforce actions** → **services/domain** → **Hair DB**. Public surfaces skip layout auth; middleware still applies host rules.

**Quick Actions (9-dot menu)** — not a route; launcher only (`HairQuickActionsMenu.tsx`):
- Express Sale → `/quick-sale`
- Advance Payment → modal (`AdvancePaymentModal`)
- Add Expense → modal (`NewExpenseModal`)

**Side effects (typical):** invoice writes trigger ledger, attributions, commission dual-write, optional stock (`applyMovement`), timeline events, notification outbox enqueue (delivery stub).

**Related surfaces:** Appointment checkout drawer redirects to Quick Sale with basket query params; billing detail can record payments via invoice lifecycle actions.
## PART 3 — COMPLETE FEATURE INVENTORY

**Legend:** working · partial · placeholder · broken · unclear · duplicate

### Salon features F-01 … F-52 (from product brain — expanded)

Each feature below maps to routes in Part 2. **Hidden** = `hidden: true` in `nav.ts` or Quick Actions only.

| FEATURE ID | Name | Route(s) | Surface | Roles | Permissions | Status |
|------------|------|----------|---------|-------|-------------|--------|
| F-01 | Revenue dashboard | `/dashboard/revenue` | S-001 | Owner, manager | `page:dashboard_revenue` | working |
| F-02 | Staff performance dashboard | `/dashboard/staff-performance` | S-002 | Owner, manager | `page:dashboard_staff` | working |
| F-03 | Front desk dashboard | `/dashboard/front-desk` | S-003 | Reception | front desk nav profile | working |
| F-04 | Customers CRM | `/customers/*` | S-006–S-008 | Staff | `page:customers` | working |
| F-05 | Appointments | `/appointments` | S-009 | Staff | `page:appointments` | working |
| F-06 | Invoices register | `/billing/invoices`, `/billing/[id]` | S-011–S-012 | Billing | `page:billing` | working |
| F-07 | Quick Sale POS | `/quick-sale` | S-013 | Cashier | `page:quick_sale` + checkout action | working |
| F-08 | Advance payment | `/advance-payment` + modal | S-014 | Billing | `page:billing`, `action:billing.checkout` | working |
| F-09 | Staff management | `/staff/*` | S-015–S-018 | HR/owner | weak `page:dashboard` layout | partial |
| F-10 | Self attendance | `/attendance` | S-019 | Employee | `page:appointments` + host guard | working |
| F-11 | Team attendance | `/attendance/manage` | S-020 | Manager | `page:dashboard` | working |
| F-12 | Attendance map | `/attendance/map` | S-021 | Manager | `page:dashboard` | partial |
| F-13 | Purchases ERP | `/purchases/*` | S-022–S-025 | Purchasing | `page:purchases` | working |
| F-14 | Purchases legacy PO | `/inventory/purchases/*` | S-072–S-074 | Admin | `page:inventory` | partial duplicate |
| F-15 | Vendors dual path | `/vendors/*`, `/inventory/vendors/*` | S-075–S-081 | Admin | `page:inventory` | partial duplicate |
| F-16 | Inventory stock | `/inventory/stock` | S-066 | Admin | `page:inventory` | working |
| F-17 | Stock movements | `/inventory/movements` | S-067 | Admin | `page:inventory` | working |
| F-18 | Stock adjustments | `/inventory/adjustments/*` | S-068–S-069 | Admin | `page:inventory`, `action:inventory.adjust` | working |
| F-19 | On-floor stock | `/inventory/on-floor` | S-070 | Admin | `page:inventory` | partial read-only |
| F-20 | Inventory transfers | `/inventory/transfers` | S-071 | Admin | `page:inventory` | placeholder |
| F-21 | Expenses | `/expenses` | S-026 | Staff | `page:expenses` | working |
| F-22 | Salary expenses | `/expenses/salary` | S-027 | Owner | host guard | working |
| F-23 | Loyalty hub | `/loyalty` | S-028 | Staff | `page:customers` | partial — no plan CRUD |
| F-24 | Memberships config | `/memberships` | S-029 | Admin | `page:memberships` | working |
| F-25 | Packages config | `/packages`, `/membership-packages` | S-030–S-031 | Admin | `page:packages` | working + duplicate route |
| F-26 | Services catalog | `/services/*` | S-032–S-034 | Admin | `page:services` | working |
| F-27 | Products catalog | `/products/*` | S-035–S-037 | Admin | **`page:settings`** (not inventory) | working |
| F-28 | Reports hub | `/reports/**` | S-038–S-051 | Admin | `page:reports` | partial TZ edges |
| F-29 | Settings | `/settings/**` | S-052–S-064 | Admin | `page:settings`, granular actions | working |
| F-30 | Historical import | `/settings/historical-import` | S-064 | Super admin | `action:import.historical` | working |
| F-31 | Global search | header + S-097 | Staff | auth only in `search.ts` | working |
| F-32 | Public invoice | `/invoice/*`, `/i/*` | S-092–S-093 | Public | none | working — tenant risk ISS-02 |
| F-33 | Profile | `/profile` | S-088 | Any staff | exempt | working read-only |
| F-34 | Platform team | `/team/*` | S-086–S-087 | Org owner | weak layout | working (platform not HR) |
| F-35 | Workforce operations | `/workforce/operations` | S-084 | HR | workforce keys | partial |
| F-36 | Employee portal | `/me` | S-085 | Employee | host + appointments page key | working |
| F-37 | Hold bills | Quick Sale | S-013 | Cashier | quick sale | working |
| F-38 | Invoice cancel/correct | billing UI | S-012 | Billing | billing + actions | working |
| F-39 | Commission rules engine | DB | — | — | — | placeholder DB-only |
| F-40 | Notifications | loyalty + outbox | S-028 | Admin | auth-only gaps | partial stub |
| F-41 | Gift cards | payment layer | billing | — | — | broken UAT-M12 |
| F-42 | Package redemption checkout | Quick Sale | S-013 | — | — | partial next phase |
| F-43 | Membership consumption checkout | Quick Sale | S-013 | — | — | partial next phase |
| F-44 | Retail stock on Quick Sale pay | Quick Sale | S-013 | — | — | partial next phase |
| F-45 | Chair/resource admin | settings/resources actions | — | Admin | partial — settings path | partial |
| F-46 | Forgot password | login | S-090 | — | — | broken UAT-M14 |
| F-47 | SaaS org picker | `/select-organization` | S-091 | Staff | FYH_SAAS_TENANT | partial |
| F-48 | Waitlist | `/salon-software` | S-094 | Public | none | working |
| F-49 | Vendor ledger/payments | `/vendors/[id]` | S-080 | Admin | inventory | working |
| F-50 | GST reports | `/reports/finance/gst` | S-049 | Admin | reports | working |
| F-51 | Commission pay action | loyalty/workforce | S-028 | Manager | `action:staff.commission_pay` | partial |
| F-52 | Express Sale launcher | 9-dot menu | — | Staff | quick sale perm | working |

### Additional features discovered (beyond 52)

| FEATURE ID | Name | Entry | Status |
|------------|------|-------|--------|
| F-53 | Dashboard redirect hub | `/dashboard` | working |
| F-54 | Billing module hub | `/billing` | working |
| F-55 | Inventory module hub | `/inventory` | working |
| F-56 | Workforce module hub | `/workforce`, `/workforce/home` | partial |
| F-57 | Subscribe marketing page | `/subscribe` | working |
| F-58 | Brand concepts marketing | `/brand-concepts` | working |
| F-59 | Invoice print API (staff) | API S-099 | working |
| F-60 | Public invoice print API | API S-100 | working |
| F-61 | Vendor PDF statement | API S-104 | working |
| F-62 | Vendor file uploads | API S-105 | working |
| F-63 | Staff QR attendance | API S-102 | working |
| F-63 | Landing page | `/landing` | unclear |
| F-64 | Platform subscription billing | Platform P-* + Stripe | working |
| F-65 | Manual subscription payment QR | Platform admin | working |

### Feature flags and gates

| Flag / env | Effect |
|------------|--------|
| `FYH_SAAS_TENANT=1` | Enables `orgFilter` / `locationFilter`, org picker, tenant write defaults |
| `WORKFORCE_ENGINE` | Workforce auth path (default on in docs) |
| `HAIR_DEV_HOST=1` | localhost treated as Hair host in dev |
| Quick Actions `canReceiveAdvance` / `canAddGeneralExpense` | Hides advance/expense launcher items |

### Hidden / Quick Actions only

- **Quick Sale** — `hidden: true` in nav; primary entry = **Express Sale** in 9-dot menu.
- **Team attendance** — hidden nav link; managers routed via `resolveAttendanceNavHref`.
- **Advance Payment / Add Expense** — modal-only via 9-dot menu.

### Duplicate routes

- `/membership-packages` vs `/packages` / `/memberships`
- `/purchases` (ERP) vs `/inventory/purchases` (legacy PO)
- `/vendors` vs `/inventory/vendors`
- Public invoice `/invoice/[n]` vs `/i/[n]`

### Entry points per major feature (SSOT files)

| Feature | UI | Actions | Services / domain | Tables |
|---------|-----|---------|-------------------|--------|
| Quick Sale | `app/(hair)/fyh/(app)/quick-sale/page.tsx` | `src/hair/actions/quickSale.ts` | `domain/checkout/pipeline.ts`, `domain/basket/engine.ts`, `services/invoices.ts` | invoices, lines, payments, attributions, ledger |
| Appointments | `appointments/page.tsx` | `actions/appointments.ts`, `booking.ts` | `services/appointments.ts` | appointments, appointment_services |
| Customers | `customers/*` | `actions/customers.ts` | `services/customers.ts` | customers, notes, timeline |
| Purchases ERP | `purchases/*` | `actions/purchases.ts` | `services/purchaseBrain.ts`, `purchaseEngine.ts` | fyh_purchases, stock_movements |
| Workforce attendance | `attendance/*` | `workforce/actions/attendance.ts` | workforce services | wf_attendance |
| Reports | `reports/**` | `actions/reports.ts` | `services/reports.ts`, attributions | invoices, attributions |

---

## PART 4 — COMPLETE USER / ACTOR / ROLE MODEL

### A. FYTECH platform roles

| Role | Storage | Auth | Capabilities |
|------|---------|------|--------------|
| Platform super admin | `platform.platform_memberships` | Platform session cookie | All orgs, admin UI P-001–P-014 |
| Platform user | `platform.users` | Platform login | Dashboard, accept invite |
| Org membership roles | `platform.memberships.role` / `access_role` | Platform + Hair cookies when SaaS | owner, co_owner, manager, receptionist, biller, staff — labels in `tenantAccessRoles.ts` |

Financial data: Platform sees **subscription/billing**, not salon invoice detail (separate DB).

### B. Salon tenant roles (legacy)

| Role | Storage | Auth |
|------|---------|------|
| `super_admin` | `fyh_admin_users.role` | Legacy session or workforce bridge |
| `admin` | `fyh_admin_users` | Same |
| JSON `permissions` | `fyh_admin_users.permissions` | 16 page + 7 action keys |

### C. Workforce roles

| Role | Storage | Auth |
|------|---------|------|
| `job_role` | `wf_engine_memberships.job_role` | `wf_auth_sessions` → `wf_employees` |
| Values | owner, manager, receptionist, biller, staff (+ stylist mappings) | `src/workforce/permissions/library.ts` (67 keys) |

### D. Legacy Hair roles

Same as B — being bridged from workforce via `hairAdminBridge.ts` (**lossy**).

### E. Operational staff identities

| Identity | Table | Login? |
|----------|-------|--------|
| Stylist/chair resource | `fyh_staff` | No — used for appointments, attributions |
| Link to workforce | Application linking in staff actions | Optional `wf_employees` link |

### F. Customer identities

| Identity | Table | Auth |
|----------|-------|------|
| Salon customer | `fyh_customers` | No login — CRM only |
| Public invoice viewer | none | Unauthenticated link by invoice number |

### G. Public / unauthenticated

Waitlist submitter, marketing visitor, public invoice reader.

### H. System / background

No Hair cron actors. Notification batch = manual `processOutboxBatchAction`. CI runs Hair E2E workflow.

### Permission gaps (known)

- ~48 `src/hair/services/*` modules without auth (`RBAC_AUDIT.md`)
- `loyalty.ts`, `services.ts`, `staffSchedules.ts`, `search.ts` — **`requireHairAuth` only**
- `/staff`, `/team`, `/workforce` — layout `page:dashboard` only (ISS-22)
- Field-level PII/financial gates not implemented

---

## PART 5 — COMPLETE PERMISSION GRAPH

```
Platform membership / wf_engine_memberships / fyh_admin_users.permissions
  ↓
Legacy page:* / action:*  OR  Workforce boolean keys (67)
  ↓
hairAdminBridge.ts (lossy mapping workforce → legacy for nav)
  ↓
(app)/layout.tsx requirePagePermissionForPath(path → page key)
  ↓
Server action requireFyhPermission / requireWorkforcePermission
  ↓
Service layer (often UNGUARDED)
  ↓
Hair DB rows
```

### Legacy page → route mapping (layout)

See `docs/foryourhair/RBAC_AUDIT.md` table: `/products` → **`page:settings`**, `/loyalty` → **`page:customers`**, `/staff` → **`page:dashboard`**.

### Workforce keys (sample categories)

Attendance (`attendance.*`), payroll (`payroll.*`), employees (`employees.*`), permissions (`permissions.manage`), schedules — full list in `src/workforce/permissions/library.ts`.

### Service-level protection (examples)

- `checkoutFromBasket` — called only from guarded actions (quick sale, appointment checkout)
- `historicalImport` — super admin
- Many read services — **no tenant or auth check inside**

### Authorization gaps register

| GAP-ID | Description |
|--------|-------------|
| GAP-01 | Services callable if action guard bypassed |
| GAP-02 | Public invoice lookup without org when SaaS off |
| GAP-03 | Catalog load unscoped (`loadBillableCatalog`) |
| GAP-04 | Lossy bridge hides missing workforce grants |
| GAP-05 | Middleware checks cookie presence not crypto (noted SAAS_READINESS) |

---

## PART 6 — COMPLETE DATABASE / DATA MODEL

**Hair DB table count (Drizzle):** 63 `fyh_*` / waitlist + 15 `wf_*` = **78 operational tables in Hair DB** (Phase 0A said 67 before waitlist/saas expansions — use this list as SSOT for Drizzle 2026-10-04).

**Platform DB:** 14 `platform.*` tables in Drizzle schema index.

### Hair entities (complete list)

| Entity ID | Table | Purpose |
|-----------|-------|---------|
| E-H-001 | `fyh_admin_users` | Legacy salon admin identities |
| E-H-002 | `fyh_auth_sessions` | Legacy admin sessions |
| E-H-003 | `fyh_settings` | Salon settings |
| E-H-004 | `fyh_customers` | CRM customers |
| E-H-005 | `fyh_customer_notes` | Notes |
| E-H-006 | `fyh_customer_timeline` | Timeline |
| E-H-007 | `fyh_staff` | Operational stylists |
| E-H-008 | `fyh_staff_schedules` | Schedules |
| E-H-009 | `fyh_resources` | Chairs/resources |
| E-H-010 | `fyh_service_categories` | Categories |
| E-H-011 | `fyh_services` | Services |
| E-H-012 | `fyh_service_staff` | Service-staff M2M |
| E-H-013 | `fyh_service_consumables` | BOM |
| E-H-014 | `fyh_appointments` | Appointments |
| E-H-015 | `fyh_appointment_services` | Appt lines |
| E-H-016 | `fyh_invoices` | Invoices |
| E-H-017 | `fyh_invoice_lines` | Lines |
| E-H-018 | `fyh_invoice_payments` | Payments |
| E-H-019 | `fyh_credit_notes` | Credit notes |
| E-H-020 | `fyh_financial_ledger` | Ledger |
| E-H-021 | `fyh_invoice_line_attributions` | Attributions |
| E-H-022 | `fyh_commission_entries` | Commissions |
| E-H-023 | `fyh_commission_rules` | Rules scaffold |
| E-H-024 | `fyh_brands` | Brands |
| E-H-025 | `fyh_products` | Products |
| E-H-026 | `fyh_stock_movements` | Stock ledger |
| E-H-027 | `fyh_vendors` | Vendors |
| E-H-028 | `fyh_purchase_orders` | Legacy PO |
| E-H-029 | `fyh_purchase_order_lines` | PO lines |
| E-H-030 | `fyh_goods_receipts` | GRN |
| E-H-031 | `fyh_goods_receipt_lines` | GRN lines |
| E-H-032 | `fyh_stock_adjustments` | Adjustments |
| E-H-033 | `fyh_product_batches` | Batches |
| E-H-034 | `fyh_purchases` | ERP purchases |
| E-H-035 | `fyh_purchase_lines` | ERP lines |
| E-H-036 | `fyh_vendor_payables` | AP |
| E-H-037 | `fyh_vendor_payments` | Vendor payments |
| E-H-038 | `fyh_vendor_payment_allocations` | Allocations |
| E-H-039 | `fyh_purchase_returns` | Returns |
| E-H-040 | `fyh_purchase_return_lines` | Return lines |
| E-H-041 | `fyh_purchase_audit_events` | Audit |
| E-H-042 | `fyh_vendor_notes` | Vendor notes |
| E-H-043 | `fyh_expenses` | Expenses |
| E-H-044 | `fyh_membership_plans` | Membership plans |
| E-H-045 | `fyh_customer_memberships` | Sold memberships |
| E-H-046 | `fyh_package_plans` | Package plans |
| E-H-047 | `fyh_package_plan_items` | Plan items |
| E-H-048 | `fyh_customer_packages` | Customer packages |
| E-H-049 | `fyh_customer_package_credits` | Credits |
| E-H-050 | `fyh_package_credit_ledger` | Credit ledger |
| E-H-051 | `fyh_bridal_profiles` | Bridal |
| E-H-052 | `fyh_bridal_events` | Bridal events |
| E-H-053 | `fyh_notification_templates` | Templates |
| E-H-054 | `fyh_notification_outbox` | Outbox |
| E-H-055 | `fyh_historical_import_batches` | Import batches |
| E-H-056 | `fyh_historical_import_row_errors` | Import errors |
| E-H-057 | `fyh_floor_issues` | Floor stock |
| E-H-058 | `fyh_tenant_mirror` | Tenant mirror |
| E-H-059 | `fyh_org_invoice_sequences` | Invoice seq |
| E-H-060 | `fyh_org_customer_sequences` | Customer seq |
| E-H-061 | `fyh_staff_locations` | Staff locations |
| E-H-062 | `fyh_location_stock` | Location stock |
| E-H-063 | `saas_waitlist_signups` | Waitlist |

### Workforce tables (Hair DB)

| Entity ID | Table | Purpose |
|-----------|-------|----------|
| E-W-001 | `wf_employees` | Employees |
| E-W-002 | `wf_engine_memberships` | Memberships |
| E-W-003 | `wf_permission_grants` | Grants |
| E-W-004 | `wf_role_templates` | Templates |
| E-W-005 | `wf_schedules` | Schedules |
| E-W-006 | `wf_attendance` | Attendance |
| E-W-007 | `wf_attendance_corrections` | Corrections |
| E-W-008 | `wf_payroll_runs` | Payroll runs |
| E-W-009 | `wf_payroll_lines` | Payroll lines |
| E-W-010 | `wf_payroll_payments` | Payroll payments |
| E-W-011 | `wf_incentives` | Incentives |
| E-W-012 | `wf_incentive_plans` | Incentive plans |
| E-W-013 | `wf_auth_sessions` | Sessions (no org_id) |
| E-W-014 | `wf_audit_log` | Audit |
| E-W-015 | `wf_events` | Events |

### Platform tables (Platform DB)

| Entity ID | Table | Purpose |
|-----------|-------|----------|
| E-P-001 | `platform.users` | Users |
| E-P-002 | `platform.platform_memberships` | Super admins |
| E-P-003 | `platform.plans` | Plans |
| E-P-004 | `platform.organizations` | Organizations |
| E-P-005 | `platform.locations` | Locations |
| E-P-006 | `platform.memberships` | Memberships |
| E-P-007 | `platform.membership_locations` | Membership locations |
| E-P-008 | `platform.organization_subscriptions` | Subscriptions |
| E-P-009 | `platform.organization_entitlements` | Entitlements |
| E-P-010 | `platform.invitations` | Invitations |
| E-P-011 | `platform.subscription_events` | Sub events |
| E-P-012 | `platform.billing_webhook_events` | Webhook log |
| E-P-013 | `platform.billing_qr_settings` | QR settings |
| E-P-014 | `platform.subscription_payment_submissions` | Manual payments |

### Tenant columns (`tenantColumns.ts`)

- `organizationIdCol()` — nullable on most rows unless SaaS NOT NULL migrations applied
- `locationIdCol()` — on location-scoped transactions
- **No FK to Platform DB**

### Schema / migration drift (verified in repo)

| Item | State |
|------|-------|
| `0036_saas_unique_indexes.sql` | In journal — per-org uniques |
| `0037_saas_not_null.sql` | **Not in journal** — file is `SELECT 1` stub; real NOT NULL in `0039_saas_phase_b.sql` per comment |
| Drizzle vs 0036 | Drizzle still declares **global** uniques on `invoice_number`, `customer_code` in billing/customers schema |
| `fyh_tenant_location_mirror` | Documented Phase 0B — **not in Drizzle** |
| Loyalty points tables | **No separate fyh_loyalty_* table** — wallet on `fyh_customers`, packages/memberships in loyalty.ts |

### Cross-database relationships

- Platform `organizations.id` mirrored as `organization_id` UUID on Hair rows (application-level only)
- Platform `locations.id` → `location_id` on Hair rows

---

## PART 7 — COMPLETE BUSINESS RULE INVENTORY

| RULE ID | Rule | Source of truth | Implemented in | Tested? |
|---------|------|-----------------|------------------|---------|
| BR-01 | Checkout SSOT = `checkoutFromBasket` | FEATURES, QUICK_SALE_ARCH | `domain/checkout/pipeline.ts` | yes — quickSaleCheckoutPipeline.test.ts |
| BR-02 | Basket pricing = `priceBasket` | QUICK_SALE_ARCH | `domain/basket/engine.ts` | basketEngine.test.ts |
| BR-03 | Display settlement = `summarizeInvoiceSettlement` | billing | `lib/billing/invoiceSettlement.ts` | invoiceBillingWorkflow.test.ts |
| BR-04 | Staff performance = paid invoice attributions | FEATURES | `fyh_invoice_line_attributions` | staffPerformance*, salesAttribution.test.ts |
| BR-05 | Service GST 18% (1800 bps) | FEATURES | services schema, taxConfig | inclusivePricingCanonical.test.ts |
| BR-06 | Quick Sale invoices `source=quick_sale` | FEATURES | checkout pipeline | integration tests |
| BR-07 | Hold bills draft + HOLD-* numbers | migration 0014 | quickSaleHold.ts | quickSaleLifecycle.test.ts |
| BR-08 | Appointment checkout → basket → Quick Sale URL | appointments service | `services/appointments.ts` | rcVisitLoop, bookingWorkflow |
| BR-09 | Stock mutations SSOT = `applyMovement` | stock service | `services/stock.ts` | stockService.test.ts, consumableDeduction |
| BR-10 | Tenant filters no-op unless FYH_SAAS_TENANT | SAAS_READINESS | `lib/tenant/filters.ts` | tenantIsolation.test.ts |
| BR-11 | Front desk nav profile | nav.ts | `isFrontDeskNavProfile` | receptionistAuthorization.test.ts |
| BR-12 | super_admin = all legacy permissions | permissionTypes | hasPermission | permissions.test.ts |
| BR-13 | Per-org invoice sequences when SaaS | saas.ts | `nextInvoiceNumberForTx` | saas phase tests |
| BR-14 | Legacy service commission dual-write | FEATURES | `applyLegacyServiceCommission` | commissionEngine.test.ts |
| BR-15 | Consumable deduct when deductInventory true | UAT-C1 fix | invoices pay path | serviceConsumablesPreserve |
| BR-16 | Dashboard staff-on-schedule salon TZ | UAT-C2 fix | financialDashboard | UAT doc |
| BR-17 | Configuration nav group scope | nav.ts | HAIR_NAV_ENTRIES | nav tests |
| BR-18 | Workforce engine id fyh_salon | workforce types | memberships | linkWorkforcePlatformMembership |
| BR-19 | Owner bootstrap slug for-your-hair | ownerSalonTenant | tenant bootstrap | tenantAuthMigration |
| BR-20 | Hair hosts bypass PG middleware paths | middleware | hairMiddleware | previewHairMiddleware.test.ts |
| BR-21 | Advance payment = invoice source advance_payment | migration 0050 | advancePayment actions | customerAdvanceReceive.test.ts |
| BR-22 | Wallet ledger SSOT financial_ledger | ledger service | postCustomerAdvanceReceiveLedger | customerAdvanceLedger.test.ts |
| BR-23 | Gift card payment blocked | UAT-M12 | payment validation | broken by design until implemented |
| BR-24 | Package credit ledger idempotency | package schema | redemption services | packageRedemptionIdempotency.test.ts |
| BR-25 | Invoice numbering global vs per-org | 0036 vs Drizzle | invoices.ts | hairMigrationJournal.test.ts |
| BR-26 | Public invoice lookup tenant rules | SAAS_READINESS | isPublicInvoiceLookupAllowed | publicInvoiceTenantIsolation.test.ts |
| BR-27 | Vendor AP from purchaseBrain | vendor brain | purchaseBrain | vendorBrain.test.ts |
| BR-28 | Expenses sector field | migration 0052 | expenses schema | expensesSector.test.ts |
| BR-29 | Attendance photo evidence | migration 0047 | wf_attendance | attendanceUx.test.ts |
| BR-30 | Duplicate phone active customer uniqueness | 0036 org-scoped | customers schema | tenant tests |

**Duplicated logic risks:** `invoiceMath.ts` vs `priceBasket`; legacy PO path vs purchaseBrain; global vs org invoice uniques in Drizzle vs SQL.

---


## PART 8 — COMPLETE BILLING GRAPH

### End-to-end lifecycle (authoritative path)

```
Customer (fyh_customers)
  → Appointment (optional) OR walk-in Quick Sale
  → Basket built (domain/basket/types.ts)
  → priceBasket (domain/basket/engine.ts) — GST-inclusive POS math
  → enrichBasketWithRedemptions (pipeline) — membership discount preview; full redemption next phase
  → validate checkout payments (validateCheckout.ts)
  → checkoutFromBasket (domain/checkout/pipeline.ts) — TRANSACTION SSOT
       → insert/update fyh_invoices, fyh_invoice_lines, fyh_invoice_payments
       → fyh_invoice_line_attributions (serviced_by / sold_by)
       → applyPaidSideEffects (services/invoices.ts)
            → postLedgerEntries / wallet reconcile (domain/ledger/service.ts)
            → applyLegacyServiceCommission
            → applyMovement for service consumables (appointment pay path)
            → package/membership activation on sale lines
            → customer timeline events
       → nextInvoiceNumberForTx (org sequences when SaaS)
  → summarizeInvoiceSettlement (display only)
  → Reports read attributions + invoices
  → Public invoice via invoice number lookup
  → notification outbox enqueue (delivery stub)
```

### Why `checkoutFromBasket` is billing SSOT

1. **Single transactional write path** for Quick Sale and appointment checkout (`quickSale.ts` actions and `services/invoices.ts` deprecated paths delegate here).
2. **Uses `priceBasket`** for persisted line totals — aligns POS with domain basket engine (QUICK_SALE_ARCHITECTURE.md).
3. **Centralizes side effects** via `applyPaidSideEffects` — ledger, commission, stock, prepaid activation.
4. **Hold bill finalization** re-enters same function with `holdInvoiceId`.
5. Tests target pipeline directly: `tests/hair/unit/quickSaleCheckoutPipeline.test.ts`.

**Not SSOT alone:** `invoiceMath.ts` helpers (hold rehydration), raw SQL in some reports, display status from `summarizeInvoiceSettlement`.

### Step reference table

| Step | File | Function | Tables | Failure modes |
|------|------|----------|--------|---------------|
| Build basket | `services/quickSale.ts`, appointment builders | buildBasket* | — | Invalid catalog refs |
| Price | `domain/basket/engine.ts` | `priceBasket` | — | GST rounding drift vs invoiceMath |
| Pay | `domain/checkout/pipeline.ts` | `checkoutFromBasket` | invoices, lines, payments | Gift card throw; validation errors |
| Side effects | `services/invoices.ts` | `applyPaidSideEffects` | ledger, stock, commission | Partial tx rollback on error |
| Advance | `actions/advancePayment.ts` | advance receive | invoices source advance_payment, ledger | auth gaps |
| Cancel | `actions/invoiceLifecycle.ts` | cancellation | credit notes, void | permission |
| Public read | `services/invoices.ts` | lookup by number | invoices | ISS-02 cross-tenant |

### Known billing bugs / gaps

- ISS-08 gift cards broken (UAT-M12)
- ISS-10/11 package redemption + retail stock on Quick Sale pay — next phase
- Dual pricing formulas (priceBasket vs invoiceMath) — correctness risk
- ISS-02 public invoice tenant scoping

---

## PART 9 — APPOINTMENT GRAPH

```
Customer → fyh_appointments (+ fyh_appointment_services)
  → staff (fyh_staff), resource (fyh_resources), location_id
  → schedule conflict checks (services/appointments.ts, booking engine)
  → status: booked → arrived → in_service → completed / cancelled / no_show
  → checkout: buildBasketFromAppointment → redirect Quick Sale OR checkoutFromBasket
  → invoice link on appointment.invoice_id
  → consumables applyMovement on pay (when deductInventory)
  → attributions from checkout
```

| Operation | Entry | Service |
|-----------|-------|---------|
| Create | calendar UI | `actions/appointments.ts` → `services/appointments.ts` |
| Reschedule | DnD / drawer | same + conflict detection |
| Cancel / no-show | drawer | status transitions |
| Complete + pay | checkout button | basket + `checkoutFromBasket` |

**Dependencies:** `fyh_staff_schedules`, `fyh_resources`, services catalog, staff roster, tenant context (location).

**UAT notes:** week/timeline views read-only (UAT-M10); notes edit at create only (UAT-M11).

---

## PART 10 — INVENTORY GRAPH

### Authoritative mutation

**`applyMovement`** in `src/hair/services/stock.ts` — all verified writers call this.

### Mutation call sites (code grep)

| Caller | Path |
|--------|------|
| ERP purchases | `services/purchases.ts`, `purchaseEngine.ts` |
| Purchase returns | `purchaseReturnEngine.ts` |
| Manual adjustments | `actions/inventory.ts` |
| Invoice pay (consumables) | `services/invoices.ts` |
| Product opening stock | `services/products.ts` |

### Read-only / no mutation

- `/inventory/stock`, `/inventory/movements` — read ledger
- `/inventory/on-floor` — floor issues read-only UI
- Quick Sale retail pay — **does not call applyMovement** (next phase)

### `/purchases` vs `/inventory/purchases`

| Aspect | `/purchases` ERP | `/inventory/purchases` legacy |
|--------|------------------|-------------------------------|
| Backend | `purchaseBrain`, `fyh_purchases` | `fyh_purchase_orders`, GRN flow |
| Nav permission | `page:purchases` | `page:inventory` |
| Stock SSOT | applyMovement via purchaseEngine | legacy PO/GRN services |
| Risk | Operators may duplicate inward stock | ISS-06 |

### `/vendors` vs `/inventory/vendors`

Same vendor tables (`fyh_vendors`); duplicate UI entry points under inventory group vs top-level vendors link (ISS-06).

### Reconciliation risks

- `fyh_products.stock_qty` legacy column vs `fyh_stock_movements` / `fyh_location_stock`
- Multi-location transfers not implemented (F-20)
- Quick Sale retail not decrementing (ISS-11)

---

## PART 11 — WORKFORCE GRAPH

```
wf_employees (login, PII)
  → wf_engine_memberships (engine_id fyh_salon, job_role)
  → wf_permission_grants + wf_role_templates
  → hairAdminBridge → legacy page:* for nav
  → fyh_staff (operational) — manual link, no schema FK
  → wf_schedules / wf_attendance (location scoped)
  → wf_payroll_* / wf_incentives
  → salon operations (appointments still FK fyh_staff)
```

**Duplication risks:**

- Two session stores: `wf_auth_sessions` vs `fyh_auth_sessions`
- Two admin models: platform membership vs fyh_admin_users vs wf_employees
- `wf_auth_sessions` lacks `organization_id` (SAAS_READINESS)

**Workforce actions:** `src/workforce/actions/{attendance,employees,payroll,permissions,operations}.ts`

---

## PART 12 — CUSTOMER GRAPH

```
Create customer (actions/customers.ts)
  → fyh_customers (+ customer_code sequence)
  → notes → fyh_customer_notes
  → timeline → fyh_customer_timeline (appointments, invoices, wallet events)
  → appointments / invoices / packages / memberships
  → wallet: fyh_financial_ledger + wallet_balance_paise cache on customer
  → archive (is_active) — no hard delete UI restore (UAT-M9)
```

**Services:** `services/customers.ts`, ledger in `domain/ledger/service.ts`

---

## PART 13 — MEMBERSHIP / PACKAGE / LOYALTY GRAPH

| Capability | Status | Tables |
|------------|--------|--------|
| Membership plan config | WORKING | fyh_membership_plans |
| Membership sale on pay | WORKING | fyh_customer_memberships |
| Membership consumption at checkout | PARTIAL / NEXT PHASE | discount preview in basket |
| Package plan config | WORKING | fyh_package_plans, items |
| Package sale on pay | WORKING | fyh_customer_packages, credits |
| Package redemption at checkout | PARTIAL / NEXT PHASE | fyh_package_credit_ledger exists |
| Loyalty points plans | NOT IMPLEMENTED as separate module | no fyh_loyalty_plans table |
| Loyalty earn/spend | PARTIAL | wallet + membership discount |
| Bridal profiles | DB + partial UI | fyh_bridal_* |
| Gift cards | BROKEN at pay | customer.gift_cards_count column only |

---

## PART 14 — NOTIFICATION GRAPH

```
Business event → enqueue fyh_notification_outbox
  → template fyh_notification_templates
  → processOutboxBatchAction (manual / loyalty UI)
  → provider adapter — STUB (no WhatsApp/SMS wired)
```

**Settings:** `/settings/whatsapp`, `/settings/communication` — config UI partial.

**Implemented vs stubbed:** Schema + enqueue **implemented**; delivery **stubbed** (UAT-M13, ISS-07).

---

## PART 15 — REPORTING / ANALYTICS GRAPH

| Report route | Primary sources | Notes |
|--------------|-----------------|-------|
| Revenue daily/monthly/yearly | invoices, payments | TZ: salon bounds in many paths; week/month historically server-local (ISS-15, partially fixed per UAT doc) |
| Staff * revenue | fyh_invoice_line_attributions | SSOT — not raw lines |
| GST | invoice lines tax fields | working |
| Inventory reports | stock_movements, products | partial |
| Customer loyalty/memberships/packages | loyalty tables | partial |

**Staff performance dashboard:** attributions + paid filter — `staffPerformanceTenant.test.ts`.

**Performance:** Dashboard multiple sequential queries (UAT perf section).

---

## PART 16 — MULTI-TENANT GRAPH

```
Platform organization/location UUIDs
  → cookies fyh_org_id / fyh_location_id
  → resolveTenantContext*
  → FYH_SAAS_TENANT flag → orgFilter/locationFilter/tenantWriteDefaults
  → Hair row organization_id / location_id
```

**Works when flag on + NOT NULL + scoped queries:** intended design.

**Does NOT work today (default):**

- orgFilter undefined → global queries
- loadBillableCatalog unscoped
- checkout/ledger paths missing tenant writes (SAAS_READINESS)
- Public invoice by number alone (ISS-02)
- wf_auth_sessions without org

**0036 / 0037:** See Part 6 — production state **unverified** without introspection.

---

## PART 17 — MULTI-LOCATION GRAPH

- `location_id` on appointments, invoices, stock movements, expenses, wf_schedules, wf_attendance
- `fyh_staff_locations`, `fyh_location_stock` for SaaS location stock
- Catalog (services, products, customers) largely **org-wide** — may be intentional
- Transfers UI placeholder — no inter-location transfer workflow (TBD-08)

---

## PART 18 — PUBLIC / CUSTOMER ACCESS

| Route | Auth | Scoping | Data exposed | Risk |
|-------|------|---------|--------------|------|
| `/invoice/[n]`, `/i/[n]` | none | invoice number lookup | invoice header/lines/payments | ISS-02 |
| `/salon-software` | none | waitlist insert | marketing | spam ISS-24 |
| `/subscribe` | none | marketing | plans copy | low |
| `/brand-concepts` | none | static | marketing | low |
| Public print API | none | number | print HTML | same as invoice |

---

## PART 19 — AUTHENTICATION GRAPH

| Flow | Route | Store |
|------|-------|-------|
| Salon staff login | `/auth/login` | wf_auth_sessions primary; legacy fyh_auth_sessions |
| Workforce session read | guards.ts | getWorkforceSession |
| Platform login | `/platform/auth/login` | platform session cookie |
| Accept invite | `/platform/auth/accept-invite` | platform.invitations |
| Org selection | `/select-organization` | SaaS flag gated |
| Forgot password | login link | **broken** placeholder |

**Duplicate systems:** legacy admin + workforce + platform — bridged at session resolution, not unified SSOT.

---

## PART 20 — HOST / MIDDLEWARE / ROUTING

```
Browser Host (fyhair.awesomepg.in | foryourhair.* | {slug}.fyhair.app)
  → middleware.ts
       → platformMiddleware if /platform/*
       → hairMiddleware if shouldRunHairMiddleware (host.ts)
       → PG paths blocked from wrong hosts
  → app/(hair)/fyh route groups
       → (public) no session
       → (app)/layout requirePagePermissionForPath
  → Server actions / API routes
```

**Hair public prefixes:** `HAIR_PUBLIC_UNPROTECTED_PREFIXES` in host.ts — `/i`, `/invoice`, `/salon-software`, `/brand-concepts`.

**Security note:** hair middleware checks session cookie presence; full verify on server layout.

---

## PART 21 — CRON / BACKGROUND / JOBS

**Hair-specific:** None in `app/api/cron/*`.

**Hair-related CI:** `.github/workflows/hair-e2e.yml` scheduled E2E.

**PG/Platform crons (same repo, not Hair):** collections-reminders, generate-monthly-rent, health-brain-integrity, etc.

**Hair notifications:** manual batch action only (ISS-16).

---

## PART 22 — INTEGRATIONS

| Provider | Purpose | Location | Env | Status |
|----------|---------|----------|-----|--------|
| Stripe | Platform subscriptions | `app/api/platform/stripe/webhook`, platform billing | Stripe secrets | working |
| Vercel Blob | Vendor files, uploads | vendor-files API | BLOB_* | working |
| Geocoding | Office location | `fyh/api/office-location/geocode` | provider key | working |
| WhatsApp/SMS/Email | Customer notifications | outbox stub | settings placeholders | **not wired** |
| PDF/Print | Invoices, vendor statements | print routes, vendor PDF API | — | HTML print working; PDF download limited UAT-M4 |
| Razorpay | — | **not in Hair billing** | — | absent by design (SaaS phase E tests) |

---

## PART 23 — COMPLETE ISSUE / BUG / DEBT REGISTER

### Architectural (ISS-* from product brain)

| ISSUE ID | Title | Status | Severity |
|----------|-------|--------|----------|
| ISS-01 | Multi-tenant data leak (orgFilter off) | OPEN | critical |
| ISS-02 | Public invoice cross-tenant read | OPEN | critical |
| ISS-03 | Catalog unscoped | OPEN | high |
| ISS-04 | Services layer unguarded | OPEN | high |
| ISS-05 | Dual RBAC + lossy bridge | PARTIAL | high |
| ISS-06 | Dual purchase/vendor UIs | OPEN | medium |
| ISS-07 | Notifications not delivered | OPEN | medium |
| ISS-08 | Gift card payments fail | BROKEN | medium |
| ISS-09 | Forgot password dead | BROKEN | medium |
| ISS-10 | Package redemption checkout | PARTIAL | medium |
| ISS-11 | Quick Sale retail stock | PARTIAL | medium |
| ISS-12 | Inventory transfers placeholder | PLACEHOLDER | low |
| ISS-13 | Chair/resource admin UI | PARTIAL | low |
| ISS-14 | Loyalty plan CRUD UI | PARTIAL | low |
| ISS-15 | Report TZ edges | PARTIAL | medium |
| ISS-16 | No Hair cron | OPEN | medium |
| ISS-17 | Doc "+ New" menu drift | HISTORICAL/doc | low |
| ISS-18 | rcVisitLoop test flake | OPEN | low |
| ISS-19 | Migration journal 0037 drift | UNCLEAR | high |
| ISS-20 | Drizzle vs 0036 uniques | UNCLEAR | high |
| ISS-21 | Commission engine no-op | PLACEHOLDER | low |
| ISS-22 | Weak staff route guard | PARTIAL | medium |
| ISS-23 | /team vs workforce confusion | WORKING-as-designed | low |
| ISS-24 | Waitlist no auth/rate limit | OPEN | low |
| ISS-25 | Tenant mirror tables incomplete | PARTIAL | medium |

### UAT register

| ID | Status | Summary |
|----|--------|---------|
| UAT-C1 | FIXED | deductInventory preserved |
| UAT-C2 | FIXED | staff on schedule KPI |
| UAT-M1–M15 | Mixed | See UAT_AUDIT.md — many marked done in stabilization waves; verify manually |
| UAT-N1–N10 | OPEN polish | Minor UX |

### BUGS.md

| ID | FYH-TEST-01 | rcVisitLoop shared seed flake | OPEN |

---

## PART 24 — HISTORICAL FIXES

| Issue | Fix | Evidence |
|-------|-----|----------|
| UAT-C1 consumables | syncConsumables preserves deductInventory | serviceConsumablesPreserve.test.ts |
| UAT-C2 dashboard KPI | Staff on schedule uses salon TZ + appointments | UAT Phase 1 |
| Hold bills | migration 0014, quickSaleHold | FEATURES.md |
| UAT-M6 TZ | salonDayBounds in reports (stabilization W1) | UAT doc strikethrough |
| UAT-M15 mobile billing/customers | responsive cards W1 | fyhAppShellResponsive tests |

Treat as **permanent rules:** BR-15, BR-16, hold bill semantics, attribution SSOT.

---

## PART 25 — MIGRATIONS / SCHEMA DRIFT

**Hair migration journal:** ends at `0052_expenses_sector` (idx 50 in _journal.json).

**Critical SaaS migrations:**

- `0036_saas_unique_indexes.sql` — journaled
- `0037_saas_not_null.sql` — stub; NOT NULL work referenced in 0039
- Drizzle declares global uniques inconsistent with 0036

**Production state:** **Not verified in this audit** — run `npm run hair:db:introspect` before SaaS cutover.

---

## PART 26 — TEST COVERAGE

**Hair tests:** 152 files matching `tests/**/*hair*` (unit + integration + e2e).

| Feature | Unit | Integration | E2E | UAT doc | Gaps |
|---------|------|-------------|-----|---------|------|
| Billing/Quick Sale | strong | rcVisitLoop | hair-ops | manual | gift cards |
| Appointments | yes | appointmentUpdate | partial | manual DnD | — |
| Inventory | stockService | inventoryOps, purchaseBrain | — | M8 partial | transfers |
| Workforce/RBAC | permissions, payrollRbac | saasPhaseC | — | M14 roles | service guards |
| Tenant/SaaS | many unit | tenantIsolation, hostile | — | — | prod migrations |
| Reports | revenueDashboard | revenueDashboardReport | — | M5/M6 | — |
| Notifications | notifications.test | — | — | M13 | delivery |
| Public invoice | publicInvoiceTenantIsolation | — | — | — | prod 0036 |

**Flaky:** FYH-TEST-01 — `rcVisitLoop.test.ts`.

---

## PART 27 — PERFORMANCE / RELIABILITY

Evidence from UAT_AUDIT + code:

- Dashboard sequential DB round-trips (UAT perf)
- Calendar heavy client bundle (UAT perf)
- No route-level loading.tsx noted (UAT)
- rcVisitLoop concurrency on shared stylist/product stock (FYH-TEST-01)
- Transaction boundaries in checkoutFromBasket (pipeline uses DB transaction — verify in file for hold paths)
- Idempotency: package credit ledger idempotencyKey unique

No load-test baselines in repo.

---

## PART 28 — COMPLETE DEPENDENCY GRAPH (textual)

### Billing
Quick Sale UI → quickSale.ts → checkoutFromBasket → invoices.ts → fyh_invoices* → ledger/stock/commission → reports/public invoice

### Appointments
Calendar → appointments.ts → appointments service → fyh_appointments → checkoutFromBasket → billing graph

### Inventory
Purchases UI → purchaseBrain → applyMovement → fyh_stock_movements → reports inventory

### Workforce
Login → wf_auth_sessions → permissions → hairAdminBridge → nav → guarded actions

### Customers
CRM → customers service → fyh_customers → timeline/ledger

### Memberships/Packages
Config UI → packages actions → loyalty schema → checkout activation

### Loyalty
/loyalty → loyalty actions → sell flows → invoices

### Expenses
expenses actions → fyh_expenses → reports

### Reports
reports actions → SQL on invoices/attributions/stock

### Notifications
events → outbox → stub processor

### Tenant isolation
Platform org → cookies → tenantContext → orgFilter → all services

### Platform subscriptions
Stripe webhook → platform DB → entitlements (Hair feature gates TO BE DEFINED)

---

## PART 29 — CHANGE IMPACT MATRIX

| If you change… | Inspect… | Test… | Risks |
|----------------|----------|-------|-------|
| checkoutFromBasket | invoices, ledger, stock, attributions, reports, public invoice | quickSaleCheckoutPipeline, rcVisitLoop, billing-settlement hair | money drift |
| priceBasket / invoiceMath | all checkout + holds | basketEngine, inclusivePricing | GST drift |
| orgFilter / FYH_SAAS_TENANT | catalog, checkout, ledger, public routes | tenantIsolation, saasPhaseC/D/F | data leak |
| hairAdminBridge | nav, all permissions | permissions, receptionist | wrong access |
| applyMovement | purchases, invoices pay, adjustments | stockService, consumableDeduction | stock drift |
| fyh_invoice_line_attributions | staff dashboards, reports | salesAttribution, staffPerformance | revenue wrong |
| Appointments service | Quick Sale checkout, stock | appointmentEngine, bookingWorkflow | double booking |
| Platform organizations | tenant bootstrap, sequences, team page | linkWorkforcePlatformMembership | orphan rows |
| 0036 uniques | public invoice, customer phone | hairMigrationJournal | migration fail |
| Workforce permissions | settings/permissions UI | payrollRbac | escalation |

---

## PART 30 — COMPLETE TO-BE-DEFINED REGISTER

| TBD ID | Decision | Why it matters |
|--------|----------|----------------|
| TBD-01 | Production 0036/0037/0039 state | Blocks SaaS |
| TBD-02 | FYH_SAAS_TENANT cutover date | Isolation |
| TBD-03 | Public invoice URL with org token | Security ISS-02 |
| TBD-04 | Canonical purchase/vendor routes | ISS-06 |
| TBD-05 | Runtime Salon Brain vs this doc | Ecosystem constitution |
| TBD-06 | Gift cards implement vs remove | ISS-08 |
| TBD-07 | Notification channel priority | ISS-07 |
| TBD-08 | Multi-location transfers | F-20 |
| TBD-09 | Commission engine vs attribution-only | F-39 |
| TBD-10 | Retail Quick Sale stock policy | ISS-11 |
| TBD-11 | co_owner workforce mapping | roles |
| TBD-12 | External salon self-serve signup | SaaS GTM |

---

## PART 31 — GRAPH DATA

**Machine-readable node/edge inventory:** see [`FYHAIR-GRAPH-DATA.md`](./FYHAIR-GRAPH-DATA.md) (NODE-ID / FROM-REL-TO format).

---

## PART 32 — FINAL EXECUTIVE MODEL

### A. What FYHAIR is today

A **production single-salon** Next.js ERP on dedicated Hair Postgres, with **Workforce HR** co-located, **Platform admin** on separate DB for org/subscription scaffolding, and **SaaS multi-tenant not safe by default**.

### B. Working

Core visit loop, Quick Sale POS, appointment calendar, invoice register, ERP purchases, vendor ledger, attributions-driven staff reports, workforce attendance, advance payments, hold bills, many settings modules.

### C. Partial

SaaS tenant enforcement, notifications delivery, loyalty plan admin, package/membership redemption at checkout, Quick Sale retail stock, dual inventory UIs, workforce ops/payroll UI depth, report TZ edge cases.

### D. Broken

Gift card payments, forgot password link.

### E. Duplicated

Legacy PO vs ERP purchases; vendor routes; RBAC systems; priceBasket vs invoiceMath; staff identity models.

### F. Unsafe

Tenant isolation off by default; public invoice lookup; unscoped catalog; service-layer auth gaps.

### G. Architecturally strong

`checkoutFromBasket` billing SSOT; `priceBasket`; `fyh_invoice_line_attributions`; `applyMovement`; monorepo host isolation; extensive Hair test suite.

### H. Unclear

Production migration parity; landing route purpose; full UAT manual matrix execution.

### I. Product owner decisions

TBD-01 through TBD-12 (Part 30).

### J. Must verify in production

0036 applied?, Drizzle vs DB uniques, Stripe subscription state, seeded vs live loyalty plans.

### K. Do not change casually

checkoutFromBasket, priceBasket, attribution writes, applyMovement, orgFilter semantics, invoice numbering.

### L. Authoritative source files

| Domain | Path |
|--------|------|
| Nav | `src/hair/lib/nav.ts` |
| Host | `src/hair/lib/host.ts` |
| Tenant | `src/hair/lib/tenant/*` |
| Permissions legacy | `src/hair/lib/auth/permissionTypes.ts` |
| Permissions workforce | `src/workforce/permissions/library.ts` |
| Bridge | `src/workforce/compat/hairAdminBridge.ts` |
| Basket | `src/hair/domain/basket/engine.ts` |
| Checkout | `src/hair/domain/checkout/pipeline.ts` |
| Invoices | `src/hair/services/invoices.ts` |
| Settlement display | `src/hair/lib/billing/invoiceSettlement.ts` |
| Stock | `src/hair/services/stock.ts` |
| Catalog adapter | `src/hair/domain/catalog/adapter.ts` |
| Schema | `src/hair/db/schema/*`, `src/workforce/db/schema.ts`, `src/platform/db/schema/index.ts` |
| SaaS assessment | `docs/SAAS_READINESS.md` |

---

## References (required reading merged into this audit)

- `docs/product-brain/FYHAIR-SALON-BRAIN.md` — executive brain + ISS/TBD
- `docs/product-brain/FYHAIR-SALON-BRAIN.mermaid` — diagrams
- `docs/product-brain/FYTECH-MASTER-BRAIN.md` — ecosystem index
- `docs/ECOSYSTEM_V2_INVENTORY.md` — Salon Engine row
- `docs/SAAS_READINESS.md` — multi-tenant blunt assessment
- `docs/foryourhair/FEATURES.md`, `RBAC_AUDIT.md`, `UAT_AUDIT.md`, `PHASE_0A_SAAS_AUDIT.md`, `QUICK_SALE_ARCHITECTURE.md`
- `docs/BUGS.md` — FYH-TEST-01



---

## APPENDIX A — Entity keys and relationships (schema patterns)

| Pattern | Columns | Notes |
|---------|---------|-------|
| Tenant org | `organization_id` UUID nullable on most `fyh_*` / `wf_*` via `organizationIdCol()` | Filtered only when `FYH_SAAS_TENANT=1` |
| Tenant location | `location_id` on appointments, invoices, stock, expenses, wf schedules/attendance | `locationFilter()` same flag gate |
| Primary keys | UUID `id` default `gen_random_uuid()` | Standard across Hair schema |
| Soft delete / archive | `is_active`, `archived_at` on catalog rows; appointments use `status` terminal states | Customers archived not deleted |
| Financial | Paise as `bigint` mode number | GST bps on services default 1800 |
| Invoice lifecycle | `status`, `voided_at`, `paid_at`, `source` enum text | Hold = draft + HOLD-* number |
| Attribution | Unique per line + staff + role; `share_bps`, `attributed_net_paise` | SSOT for performance |
| Workforce session | `wf_auth_sessions.employee_id` → `wf_employees` | **No organization_id on session row** |

### Important FK chains

- `fyh_appointments.customer_id` → `fyh_customers.id`
- `fyh_appointments.staff_id` → `fyh_staff.id`
- `fyh_appointments.invoice_id` → `fyh_invoices.id`
- `fyh_invoice_lines.invoice_id` → `fyh_invoices.id`
- `fyh_invoice_line_attributions.invoice_line_id` → `fyh_invoice_lines.id`
- `fyh_financial_ledger.customer_id` → `fyh_customers.id`
- `wf_engine_memberships.employee_id` → `wf_employees.id`

**Cross-DB:** Platform `organizations.id` copied to Hair `organization_id` without PostgreSQL FK.

---

## APPENDIX B — Server actions inventory (`src/hair/actions/`)

| File | Primary guards | Domain |
|------|----------------|--------|
| `advancePayment.ts` | page:billing, checkout | Wallet advance |
| `appointments.ts` | page:appointments | Calendar |
| `auth.ts` | public/login | Session |
| `booking.ts` | appointments | Booking helpers |
| `customers.ts` | page:customers | CRM |
| `expenses.ts` | page:expenses | Expenses |
| `financialDashboard.ts` | page:dashboard | Dashboard KPIs |
| `historicalImport.ts` | super admin | Import |
| `inventory.ts` | page:inventory, adjust action | Stock adjustments |
| `invoiceLifecycle.ts` | billing | Cancel/correct |
| `invoiceRegister.ts` | page:billing | Invoice list |
| `loyalty.ts` | requireHairAuth only | Loyalty hub |
| `notifications.ts` | auth | Outbox batch |
| `packages.ts` | page:packages | Package CRUD |
| `platformBilling.ts` | platform | Cross-product billing bridge |
| `products.ts` | mixed | Products |
| `purchases.ts` | page:purchases | ERP purchases |
| `quickSale.ts` | page:quick_sale, checkout | POS |
| `quickSaleCustomer.ts` | quick sale | Customer search |
| `reports.ts` | export action | Reports |
| `resources.ts` | settings | Chairs/resources |
| `saasWaitlist.ts` | **none** | Waitlist |
| `search.ts` | auth only | Global search |
| `services.ts` | auth only | Services |
| `settings.ts` | settings.edit | Settings |
| `staff.ts` | staff/dashboard | Staff roster |
| `staffPerformanceExport.ts` | dashboard_staff | CSV export |
| `staffSchedules.ts` | auth only | Schedules |
| `subscribe.ts` | public | Marketing |
| `team.ts` | platform roles | Org team |
| `tenant.ts` | SaaS | Org bind |
| `vendors.ts` | inventory | Vendors |
| `vendorLedger.ts` | inventory | Vendor payments |

**Workforce actions:** `src/workforce/actions/attendance.ts`, `employees.ts`, `operations.ts`, `payroll.ts`, `permissions.ts`, `parseHrForm.ts`

---

## APPENDIX C — `checkoutFromBasket` internals (why SSOT)

File: `src/hair/domain/checkout/pipeline.ts`

1. Validates basket lines via `collectBasketLineValidationErrors`.
2. Calls `priceBasket` for priced totals (GST-inclusive engine).
3. Optionally merges redemptions via `enrichBasketWithRedemptions` / `computeRedemptions`.
4. Validates payments via `collectPaymentValidationErrors`.
5. Runs DB transaction:
   - Resolves hold invoice if `holdInvoiceId`
   - Assigns invoice number via `nextInvoiceNumberForTx` (org-scoped sequences when enabled)
   - Inserts/updates `fyh_invoices`, lines, payments
   - Writes attributions for serviced_by / sold_by splits
   - Calls `applyPaidSideEffects` in `services/invoices.ts` (ledger, commission, stock, prepaid packages/memberships, timeline)
6. Returns `{ invoiceId, pricedGrandTotalPaise, amountPaidPaise, advancePaise, receivablePaise }`.

**Callers verified in repo:** `src/hair/actions/quickSale.ts`, `src/hair/services/invoices.ts` (appointment checkout, legacy finalize paths).

**Tests:** `tests/hair/unit/quickSaleCheckoutPipeline.test.ts`, `quickSaleCheckoutValidation.test.ts`, integration RC loops.

---

## APPENDIX D — Hair services directory (~48 modules)

All under `src/hair/services/` — **none enforce auth internally** (RBAC at action/route only). Notable modules:

`appointments.ts`, `customers.ts`, `invoices.ts`, `stock.ts`, `reports.ts`, `quickSale.ts`, `quickSaleHold.ts`, `purchaseBrain.ts`, `purchaseEngine.ts`, `purchases.ts`, `products.ts`, `salonServices.ts`, `vendorBrain.ts`, `commissionEngine.ts`, `notifications.ts`, `packages.ts`, `memberships.ts`, `expenses.ts`, `financialLedger.ts`, `historicalImport.ts`, `settings.ts`, `tenantBootstrap.ts`, …

Full listing: `ls src/hair/services/*.ts` in repo (48 TS files at audit time).

---

## APPENDIX E — UAT issue register (full IDs)

**Critical (resolved):** UAT-C1, UAT-C2

**Major:** UAT-M1 staff schedules UI, UAT-M2 chairs admin, UAT-M3 retail invoice (partially addressed via Quick Sale), UAT-M4 PDF, UAT-M5 reports depth (partially expanded), UAT-M6 timezone (stabilization W1), UAT-M7 loyalty plan CRUD, UAT-M8 inventory (partially expanded), UAT-M9 archive restore, UAT-M10 week view, UAT-M11 notes edit, UAT-M12 gift card, UAT-M13 notifications, UAT-M14 forgot password / roles (workforce partially addresses roles), UAT-M15 mobile tables (W1 billing/customers)

**Minor:** UAT-N1 through UAT-N10 — see `docs/foryourhair/UAT_AUDIT.md`

---

## APPENDIX F — Platform vs salon route map

| URL prefix | Product |
|------------|---------|
| `/fyh/*` on Hair host | Salon tenant |
| `/platform/*` | FYTECH platform |
| `/api/hair/*` | Hair APIs (vendor PDF, files) |
| `/api/platform/stripe/webhook` | Platform Stripe |
| `/api/cron/*` | PG/ecosystem crons — **not Hair** |


*End of FYHAIR-COMPLETE-AUDIT.md*

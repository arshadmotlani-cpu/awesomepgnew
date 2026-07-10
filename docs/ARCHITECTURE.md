# Architecture

> System design, data flow, and module relationships.  
> Codebase: Next.js 16 App Router + service layer SSOT.

Cross-links: [[AI_CONTEXT]] · [[DATABASE]] · [[ROUTES]] · [[WORKFLOWS]] · [[DECISIONS]]

---

## High-level diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│  ├─ Public (pgs, booking)                                   │
│  ├─ Customer account (profile, resident hub)                  │
│  └─ Admin console (sidebar modules)                         │
└──────────────────────────┬──────────────────────────────────┘
                           │ RSC + Server Actions + API routes
┌──────────────────────────▼──────────────────────────────────┐
│  Presentation layer                                          │
│  app/(admin)/admin/*  app/(customer)/*  app/api/*           │
│  src/components/admin/*  src/components/customer/*          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  Service layer (SSOT business logic)                         │
│  src/services/*.ts  src/lib/* (pure helpers)                │
└──────────────────────────┬──────────────────────────────────┘
                           │ Drizzle ORM
┌──────────────────────────▼──────────────────────────────────┐
│  PostgreSQL                                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer rules

| Layer | May do | Must not |
|-------|--------|----------|
| **Pages / components** | Render, collect input, call actions | Duplicate billing math, query raw SQL for money |
| **Server actions** | Auth guard, validate, call services, revalidate | Business logic beyond thin orchestration |
| **Services** | Transactions, invariants, audit log | Import React |
| **Lib helpers** | Pure functions (dates, format, proration) | DB access (exceptions: query modules) |

---

## Admin modules

Defined in `src/lib/admin/navigation.ts`:

| Module | Route | Primary concern |
|--------|-------|-----------------|
| Overview | `/admin/overview` | KPIs, sync, notifications |
| Revenue | `/admin/revenue` | Charts, PG breakdown |
| Invoices | `/admin/invoices` | Unified registry |
| Deposits | `/admin/deposits` | Wallets |
| Checkout settlements | `/admin/checkout-settlements` | [[Vacating]] refunds |
| PGs | `/admin/pgs` | Inventory |
| [[Residents]] | `/admin/residents` | Per-resident hub |
| [[KYC]] | `/admin/residents/kyc` | Identity |
| [[Operations]] | `/admin/operations` | **Action queue** |
| Analytics | `/admin/analytics` | Traffic only |
| System | `/admin/system` | Health |
| Panel | `/admin/panel` | Advanced tools |

**Billing hub** lives under Revenue: `/admin/revenue/billing` (not a top-level sidebar item).

---

## Service map (SSOT)

### Financial core

```
residentFinancialEngine.ts  ←── ALL admin/resident money displays
         │
         ├── rentInvoices.ts ←── billing.ts (proration, late fee)
         ├── electricityBilling.ts ←── meterElectricity.ts
         ├── deposits.ts ←── depositOperations.ts
         └── unifiedInvoices.ts ←── financial_invoices table
```

**Rule:** UI reads `getResidentFinancialSummary()` / `getBookingFinancialSummary()` — never recomputes outstanding.

### Occupancy core

```
occupancySsot.ts  ←── SQL for "who occupies bed today"
         │
         ├── pgBedMap.ts
         ├── residentActiveTenancy.ts
         └── bedAssignmentCommand.ts
```

**Rule:** Bed map and residents list must use same assignment predicates ([[DECISIONS#Bed assignment SSOT]]).

### Move-out core

```
vacating.ts
    ├── submitVacatingRequest / approveVacatingRequest
    ├── vacatingCheckoutBilling.ts  (checkout-month rent)
    └── checkoutSettlement.ts  (refund workflow)
         └── moveOutPipeline.ts  (admin UI stage derivation)
```

### Operations core

```
residentOperationsDashboard.ts
    ├── buildResidentOperationsDashboard (lib)
    ├── actionItems.ts (sync)
    └── actionExecution.ts (WhatsApp, email, links)
```

### Booking core

```
bookingLifecycle.ts  ←── payment webhooks
tenantAssignment.ts
pricingPropagation.ts
```

---

## Data flow examples

### Monthly rent generation

```
Cron /admin action
  → rentInvoices.generateRentInvoicesForMonth()
  → billing.prorateForMonth() + loadStayWindow()
  → INSERT rent_invoices
  → unifiedInvoices.syncRentInvoiceToUnified()
  → actionItems.syncActionItems() (optional)
```

### Vacating submit

```
Resident form
  → vacating.submitVacatingRequest()
  → INSERT vacating_requests
  → vacatingCheckoutBilling.syncVacatingCheckoutRentBilling()
  → cancel future rent invoices
  → email notifyVacatingUpdate()
```

### Vacating approve

```
Admin ApproveVacatingButton
  → vacating.approveVacatingRequest()
  → shorten bed_reservations (if future date)
  → syncVacatingCheckoutRentBilling() (idempotent)
  → checkoutSettlement.createCheckoutSettlementFromVacating()
  → revalidateVacatingLifecycleViews()
```

### Deposit refund

```
Resident (after gates) → residentRequests
  → checkout_settlement updated
Admin → checkoutSettlement.approve / markRefundPaid
  → deposit_ledger refunded entry
  → vacating.complete (optional)
```

---

## State management

| Area | Pattern |
|------|---------|
| Server state | PostgreSQL + RSC fetch |
| Forms | Server Actions + `useActionState` |
| Client UI | React `useState`, `details` menus |
| Global admin drawer | `AdminActionDrawerProvider` (context) |
| Customer resident tabs | URL search params (`accountNavigation.ts`) |
| No Redux | Zustand only where needed (minimal) |

---

## Auth & authorization

```
middleware.ts          → session cookie on protected paths
requireAdminSession()  → admin layout guard
requireAdminPermission('deposits:write')  → action guard
assertAdminCanAccessPg()  → PG scope filter
```

Roles in `src/lib/auth/roles.ts`. PG scope on `admin_users.pg_scope`.

---

## Revalidation strategy

| Event | Paths revalidated |
|-------|-------------------|
| Financial change | `revalidateFinancialViews()` |
| Vacating change | `revalidateVacatingLifecycleViews()` |
| Occupancy change | `revalidateOccupancyViews()` |
| Invoice action | `/admin/invoices/[id]`, overview, revenue |

Prevents stale UI without full cache bust.

---

## Client / server boundary

Next.js RSC passes props to `'use client'` components as JSON.

**Never pass:**
- `Date` objects → use ISO strings ([[DECISIONS#Client Date serialization]])
- `Map` / `Set` → convert to plain objects/arrays
- Functions

**Fixed:** `MoveOutPipelineQueue` uses `toClientMoveOutPipelineItem()` (`d4c01c6`).

---

## External integrations

| Service | Usage |
|---------|-------|
| Razorpay | Booking checkout, webhooks |
| Vercel Blob | KYC, meter photos, QR |
| Nodemailer | Transactional email |
| Sentry | Error tracking |
| PostHog / Vercel Analytics | Product analytics |

---

## Testing architecture

| Layer | Location |
|-------|----------|
| Pure billing math | `tests/unit/billing.test.ts` |
| Vacating / occupancy | `tests/unit/vacating*.test.ts`, `occupancy*.test.ts` |
| Integration | `tests/integration/` (webhooks, routes) |

Run: `npm test`

---

## Module dependency graph (simplified)

```mermaid
flowchart TB
  subgraph UI
    AdminPages[Admin Pages]
    ResidentHub[Resident Hub]
  end
  subgraph Services
    RFE[residentFinancialEngine]
    Vacating[vacating.ts]
    Checkout[checkoutSettlement.ts]
    Occupancy[occupancySsot.ts]
    Actions[actionItems.ts]
  end
  subgraph DB
    PG[(PostgreSQL)]
  end
  AdminPages --> RFE
  AdminPages --> Vacating
  AdminPages --> Checkout
  AdminPages --> Occupancy
  AdminPages --> Actions
  ResidentHub --> RFE
  ResidentHub --> Vacating
  RFE --> PG
  Vacating --> PG
  Checkout --> PG
```

---

## Related docs

- Deep product spec: [[AWESOME_PG_MASTER_DOCUMENTATION_V2]]
- Legacy v1: [[AWESOME_PG_MASTER_DOCUMENTATION]]
- Feature list: [[features]]
- Routes: [[ROUTES]]

[[AI_CONTEXT]] · [[DATABASE]] · [[WORKFLOWS]]

<!-- DOC_SYNC_TOUCH_2026-06-21 -->
> **2026-06-21 21:03:08 UTC** — Code changed in: Routes, Vacating, Billing. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-22 -->
> **2026-06-22 00:25:15 UTC** — Code changed in: Routes, Auth, Billing. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-23 -->
> **2026-06-23 07:25:58 UTC** — Code changed in: Routes, Auth, Billing. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-24 -->
> **2026-06-24 09:55:58 UTC** — Code changed in: Routes, Billing, Bookings. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-25 -->
> **2026-06-25 13:43:37 UTC** — Code changed in: Routes, Billing, Bookings. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-26 -->
> **2026-06-26 11:29:51 UTC** — Code changed in: Routes, Database, Billing, Action Center, Electricity. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-27 -->
> **2026-06-27 08:37:59 UTC** — Code changed in: Vacating, Action Center, Residents. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-29 -->
> **2026-06-29 08:55:28 UTC** — Code changed in: Routes, Billing, Vacating, Action Center. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-30 -->
> **2026-06-30 07:29:12 UTC** — Code changed in: Routes, Billing. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-01 -->
> **2026-07-01 06:59:17 UTC** — Code changed in: Billing, Action Center, Electricity. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-02 -->
> **2026-07-02 08:03:54 UTC** — Code changed in: Routes, Auth. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-03 -->
> **2026-07-03 08:28:00 UTC** — Code changed in: Routes, Billing. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-04 -->
> **2026-07-04 07:48:05 UTC** — Code changed in: Database, Electricity, Billing. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-05 -->
> **2026-07-05 10:29:21 UTC** — Code changed in: Routes, Database, Billing, Bookings, Vacating. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-07 -->
> **2026-07-07 06:19:57 UTC** — Code changed in: Database, Billing. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-08 -->
> **2026-07-08 08:33:09 UTC** — Code changed in: Routes, Billing. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-09 -->
> **2026-07-09 08:00:44 UTC** — Code changed in: Routes, Billing, Bookings. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-10 -->
> **2026-07-10 09:34:26 UTC** — Code changed in: Billing. Manual review recommended.

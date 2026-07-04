# Routes

> All application routes as of **2026-06-21**. Canonical paths marked **bold**.  
> Source: `app/**/page.tsx`, `feature-inventory.md`, `src/lib/admin/navigation.ts`.

Cross-links: [[features]] · [[ARCHITECTURE]] · [[Operations]] · [[Billing]] · [[Vacating]]

---

## Public & customer

### Marketing

| Route | Purpose | Auth |
|-------|---------|------|
| `/` | Landing | Public |
| `/about`, `/guide`, `/enquiry` | Marketing | Public |
| `/login` | Customer login | Public |

### PG discovery

| Route | Purpose |
|-------|---------|
| `/pgs` | Browse all PGs |
| `/pgs/compare` | Compare properties |
| `/pgs/[pgSlug]` | PG detail |
| `/pgs/[pgSlug]/rooms/[roomId]` | Room / bed picker |

### Booking

| Route | Purpose |
|-------|---------|
| **`/booking/new`** | Cart & confirm |
| `/booking/[bookingCode]` | Booking detail |
| `/booking/[bookingCode]/pay` | Razorpay / UPI checkout |
| `/booking/[bookingCode]/payment-success` | Post-payment |
| `/booking/[bookingCode]/extend` | Redirect (retired) |
| `/booking/[bookingCode]/extend/[extensionId]/pay` | Legacy extension pay |
| `/reserve/new` | Bed reserve (page guard) |
| **`/pay/[linkId]`** | [[Payment Links]] public pay |

### Account hub

| Route | Purpose |
|-------|---------|
| **`/account/profile`** | Unified hub — profile, KYC, resident tabs |
| `/account/bookings` | All bookings |
| `/account/favorites` | Saved PGs |
| `/account/change-password`, `/account/set-password` | Password |
| `/account/payments/[paymentId]/receipt` | Receipt |

**Resident tab query:** `?section=resident&tab=home|wallet|payments|requests|room|vacating|notifications|concierge`

### Resident billing & [[Vacating]]

| Route | Purpose |
|-------|---------|
| `/account/resident/request-vacating/[bookingId]` | File move-out notice |
| `/account/resident/history/[bookingId]` | Payment history |
| `/account/resident/pay-rent/[invoiceId]` | Rent UPI proof |
| `/account/resident/pay-electricity/[invoiceId]` | Electricity UPI proof |
| `/account/resident/pay-ps4/[membershipId]` | PS4 payment |
| `/account/resident/ps4/new` | PS4 subscribe |

### Redirect aliases

| Alias | → Canonical |
|-------|-------------|
| `/account/kyc` | `/account/profile?section=identity` |
| `/account/resident` | `/account/profile?section=resident&tab=home` |
| `/account/wallet` | `?section=resident&tab=wallet` |
| `/account/payments` | `?section=resident&tab=payments` |

---

## Admin

Sidebar modules: `src/lib/admin/navigation.ts` → [[ARCHITECTURE#Admin modules]]

### Entry & overview

| Route | Purpose |
|-------|---------|
| `/admin` | → `/admin/overview` |
| **`/admin/overview`** | KPI control board, Action Center sync |
| `/admin/dashboard`, `/admin/actions`, `/admin/occupancy` | Legacy → overview |
| `/admin/overview/analytics` | → `/admin/analytics` |
| `/admin/overview/health` | → `/admin/system` |
| `/admin/overview/operations` | → `/admin/operations` |
| `/admin/overview/revenue` | → `/admin/revenue` |

### Revenue & [[Billing]]

| Route | Purpose |
|-------|---------|
| **`/admin/revenue`** | Month-scoped charts |
| **`/admin/revenue/billing`** | **Canonical billing hub** (rent, elec, approvals) |
| `/admin/revenue/pg/[pgId]` | PG financial index |
| `/admin/revenue/pg/[pgId]/resident/[residentId]` | Resident drill-down |
| `/admin/collections` | → billing |
| `/admin/rent` | → billing `?tab=rent` |
| `/admin/payments` | → billing `?tab=approvals` |
| **`/admin/invoices`** | Unified invoice registry |
| `/admin/invoices/[invoiceId]` | Detail + cancel/refund |
| `/admin/invoices/[invoiceId]/print` | Print view |

### [[Deposits]] & checkout

| Route | Purpose |
|-------|---------|
| **`/admin/deposits`** | Deposit invoice table |
| `/admin/deposits/add` | Record offline deposit |
| `/admin/deposits/advance` | Advance deposit |
| `/admin/deposits/collected` | Month report |
| **`/admin/deposits/[bookingId]`** | Ledger + advanced tools |
| **`/admin/checkout-settlements`** | [[Vacating]] refund queue |
| **`/admin/checkout-settlements/[id]`** | Settlement review |

### [[Residents]] & [[KYC]]

| Route | Purpose |
|-------|---------|
| **`/admin/residents`** | Tenant directory |
| **`/admin/residents/[customerId]`** | Financial command center |
| **`/admin/residents/kyc`** | KYC queue |
| `/admin/residents/kyc/[submissionId]` | Single review |
| `/admin/kyc/*` | → `/admin/residents/kyc/*` |
| `/admin/bookings` | All bookings |
| `/admin/bookings/new` | Assign tenant |
| `/admin/bookings/[bookingId]` | Booking ops |
| `/admin/extensions` | → bookings |

### [[Operations]] & [[Vacating]]

| Route | Purpose |
|-------|---------|
| **`/admin/operations`** | **Primary action queue** |
| `/admin/operations/pg/[pgId]` | PG ops drill-down |
| `/admin/operations/pg/[pgId]/resident/[residentId]` | Resident ops |
| **`/admin/vacating`** | Move-out pipeline |
| `/admin/vacating?legacy=1` | Legacy table view |
| `/admin/requests` | **Deprecated** |

### Inventory & [[Bed Assignment]]

| Route | Purpose |
|-------|---------|
| **`/admin/pgs`** | PG list |
| `/admin/pgs/new`, `/admin/pgs/[pgId]/edit` | CRUD |
| `/admin/pgs/[pgId]/listing` | Public listing editor |
| **`/admin/pgs/[pgId]/map`** | Bed map |
| `/admin/pgs/[pgId]/rooms` | Room inventory |
| `/admin/pgs/[pgId]/collections` | PG payment proofs |
| `/admin/electricity/new` | Create room bill |
| `/admin/electricity` | → billing `?tab=electricity` |
| `/admin/pricing` | Bed rate tiers |
| `/admin/rooms`, `/admin/beds`, `/admin/floors` | → pgs |

### System & panel

| Route | Purpose |
|-------|---------|
| `/admin/analytics` | Visitor analytics |
| `/admin/system` | Health, integrations |
| `/admin/system/financial-audit` | Reconciliation |
| `/admin/system/bed-audit` | Bed mismatch repair |
| `/admin/system/health-report` | Full audit |
| `/admin/system/pricing-health` | Pricing consistency |
| `/admin/system/recalculate-financial` | Recalc tool |
| **`/admin/panel`** | Links, coupons, permissions |
| `/admin/monitoring`, `/admin/deployments`, `/admin/emails` | Ops |
| `/admin/playstation` | PS4 admin |
| `/admin/notifications` | Admin inbox |
| `/admin/settings` | Config + repair |
| `/admin/guide` | In-app help |
| `/admin/health` | Health probe UI |

### Admin auth

| Route | Purpose |
|-------|---------|
| `/admin/login` | Admin login |
| `/admin/forgot-password`, `/admin/reset-password`, `/admin/change-password` | Password |

---

## API routes

### Auth

`/api/auth/customer/*`, `/api/auth/admin/*`, `/api/auth/logout`

### Payments & proofs

| Route | Purpose |
|-------|---------|
| `/api/webhooks/razorpay` | Payment webhooks |
| `/api/payments/razorpay/verify`, `status` | Client verify |
| `/api/rent-invoice/[id]/payment-proof` | Rent proof upload |
| `/api/payment-record/*` | QR / offline records |

### Admin API

`/api/admin/deposits/*`, `/api/admin/residents/search`, notifications, health, analytics

### Cron (Vercel)

| Route | Schedule | Purpose |
|-------|----------|---------|
| `/api/cron/generate-monthly-rent` | Daily | Rent invoices |
| `/api/cron/automation` | Daily | Action sync + WhatsApp |
| `/api/cron/release-holds` | Daily | Expire holds |
| `/api/cron/expire-bed-reserves` | Daily | Expire reserves |

Full cron list: `feature-inventory.md` §1.4.

---

## Where to act (quick map)

| Task | Route |
|------|-------|
| Daily queue | [[Operations]] `/admin/operations` |
| Approve move-out | [[Vacating]] `/admin/vacating` |
| Refund payout | `/admin/checkout-settlements/[id]` |
| Assign bed | `/admin/pgs/[pgId]/map` |
| Approve UPI proof | [[Billing]] `/admin/revenue/billing` |
| Resident money | [[Residents]] `/admin/residents/[id]` |

See [[DECISIONS#Operations as action hub]].

---

## Related

[[features]] · [[DATABASE]] · [[ARCHITECTURE]] · [[AI_CONTEXT]]

<!-- DOC_SYNC_TOUCH_2026-06-21 -->
> **2026-06-21 21:03:08 UTC** — Code changed in: Routes, Vacating, Billing. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-22 -->
> **2026-06-22 00:18:56 UTC** — Code changed in: Routes. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-23 -->
> **2026-06-23 07:25:58 UTC** — Code changed in: Routes, Auth, Billing. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-24 -->
> **2026-06-24 07:05:49 UTC** — Code changed in: Routes. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-25 -->
> **2026-06-25 12:10:42 UTC** — Code changed in: Routes. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-26 -->
> **2026-06-26 07:02:31 UTC** — Code changed in: Routes, Vacating. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-27 -->
> **2026-06-27 07:03:22 UTC** — Code changed in: Routes. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-29 -->
> **2026-06-29 08:55:28 UTC** — Code changed in: Routes, Billing, Vacating, Action Center. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-06-30 -->
> **2026-06-30 06:36:43 UTC** — Code changed in: Routes, Residents. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-01 -->
> **2026-07-01 06:24:39 UTC** — Code changed in: Routes, Residents. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-02 -->
> **2026-07-02 07:48:57 UTC** — Code changed in: Routes. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-03 -->
> **2026-07-03 07:18:22 UTC** — Code changed in: Routes. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-04 -->
> **2026-07-04 07:42:32 UTC** — Code changed in: Routes. Manual review recommended.

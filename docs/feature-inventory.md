# Awesome PG — Feature Inventory (Phase 1 Audit)

**Generated:** 2026-06-19  
**Scope:** Full platform — admin, customer/resident, API, cron, permissions, financial flows  
**Purpose:** Mandatory audit before UX redesign. **No business logic, financial logic, or permissions were modified to produce this document.**  
**Companion:** [AWESOME_PG_MASTER_DOCUMENTATION_V2.md](./AWESOME_PG_MASTER_DOCUMENTATION_V2.md)

---

## 0. How to use this document

| Section | Contents |
|---------|----------|
| §1 | Route inventory (admin, customer, API, redirects) |
| §2 | Admin permissions & roles |
| §3 | Workflow maps (booking, deposit, KYC, vacating, billing) |
| §4 | Financial calculation inventory (read-only reference) |
| §5 | Duplicate / overlapping screens |
| §6 | Screens with >5 primary actions |
| §7 | Jargon & label issues |
| §8 | Resident simplification opportunities |
| §9 | Key file index |

**Redesign rule (Phase 2+):** Change presentation only unless explicitly approved. SSOT services listed in §4 must not be reimplemented in UI.

---

## 1. Route inventory

### 1.1 Customer / public routes

| Route | Purpose | Auth |
|-------|---------|------|
| `/` | Marketing landing | Public |
| `/login` | Customer login | Public |
| `/pgs` | Browse PGs | Public |
| `/pgs/compare` | Compare PGs | Public |
| `/pgs/[pgSlug]` | PG detail | Public |
| `/pgs/[pgSlug]/rooms/[roomId]` | Room / bed selection | Public |
| `/about`, `/guide`, `/enquiry` | Marketing / help | Public |
| `/booking/new` | Cart & confirm booking | Session (middleware) |
| `/booking/[bookingCode]` | Booking detail | Session |
| `/booking/[bookingCode]/pay` | Initial UPI checkout | Session |
| `/booking/[bookingCode]/payment-success` | Post-payment | Session |
| `/booking/[bookingCode]/extend` | **Redirect** — extend retired | Session |
| `/booking/[bookingCode]/extend/[extensionId]/pay` | Legacy extension pay | Session |
| `/reserve/new` | Bed reserve flow | Page guard |
| `/pay/[linkId]` | Payment link (rent/elec/deposit) | Page guard |
| `/account/profile` | Unified account hub (profile / KYC / resident) | Session |
| `/account/bookings` | All bookings list | Session |
| `/account/favorites` | Saved PGs (localStorage) | Session |
| `/account/change-password`, `/account/set-password` | Password | Session |
| `/account/payments/[paymentId]/receipt` | Receipt | Session |
| `/account/resident/request-vacating/[bookingId]` | Vacating notice form | Session |
| `/account/resident/history/[bookingId]` | Payment history | Session |
| `/account/resident/pay-rent/[invoiceId]` | Rent UPI proof | Session |
| `/account/resident/pay-electricity/[invoiceId]` | Electricity UPI proof | Session |
| `/account/resident/pay-ps4/[membershipId]` | PS4 add-on pay | Session |
| `/account/resident/ps4/new` | PS4 subscribe | Session |

**Redirect aliases (canonical target):**

| Alias | Redirects to |
|-------|----------------|
| `/account/kyc` | `/account/profile?section=identity` |
| `/account/resident` | `/account/profile?section=resident&tab=home` |
| `/account/wallet` | `?section=resident&tab=wallet` |
| `/account/payments` | `?section=resident&tab=payments` |

**Resident hub tabs** (`src/lib/accountNavigation.ts`): `home`, `wallet`, `payments`, `requests`, `room`, `vacating`, `notifications`, `referrals`, `concierge`.

**Middleware** (`middleware.ts`): protects `/booking/*`, `/account/*`, `/pgs/*` — **not** `/reserve/*` or `/pay/*` (page-level guards only).

---

### 1.2 Admin routes (~73 paths)

#### Entry & overview

| Route | Purpose |
|-------|---------|
| `/admin` | → `/admin/overview` |
| `/admin/overview` | KPI control board, sync actions, notifications |
| `/admin/dashboard`, `/admin/actions`, `/admin/occupancy` | Legacy redirects |
| `/admin/overview/analytics` | → `/admin/analytics` |
| `/admin/overview/health` | → `/admin/system` |
| `/admin/overview/operations` | → `/admin/operations` |
| `/admin/overview/revenue` | → `/admin/revenue` |
| `/admin/overview/pg/[pgId]` | Legacy PG drill redirect |

#### Revenue & billing

| Route | Purpose |
|-------|---------|
| `/admin/revenue` | Month-scoped revenue charts, PG table |
| `/admin/revenue/billing` | **Canonical billing hub** (5 tabs) |
| `/admin/revenue/pg/[pgId]` | PG resident financial index |
| `/admin/revenue/pg/[pgId]/resident/[residentId]` | Per-resident revenue drill-down |
| `/admin/collections` | → `/admin/revenue/billing` |
| `/admin/collections/pg/...` | Legacy collections drill paths |
| `/admin/rent` | → billing `?tab=rent` |
| `/admin/payments` | → billing `?tab=approvals` |
| `/admin/invoices` | Unified invoice registry |
| `/admin/invoices/[invoiceId]` | Invoice detail + actions |
| `/admin/invoices/[invoiceId]/print` | Printable invoice |

#### Deposits & checkout

| Route | Purpose |
|-------|---------|
| `/admin/deposits` | Active/settled deposit invoice table |
| `/admin/deposits/add` | Search resident → record offline deposit |
| `/admin/deposits/advance` | Advance deposit (no bed assignment) |
| `/admin/deposits/collected` | Month-scoped deposit collected report |
| `/admin/deposits/[bookingId]` | Per-booking ledger, correct, settle, advanced tools |
| `/admin/checkout-settlements` | Vacating checkout queue (5 status tabs) |
| `/admin/checkout-settlements/[id]` | Settlement review + refund |

#### Residents, bookings, KYC

| Route | Purpose |
|-------|---------|
| `/admin/residents` | Verified tenants + unverified signups |
| `/admin/residents/[customerId]` | **Resident hub** — financial command center |
| `/admin/residents/kyc` | KYC queues |
| `/admin/residents/kyc/[submissionId]` | Single submission review |
| `/admin/kyc/*` | → `/admin/residents/kyc/*` |
| `/admin/bookings` | All bookings |
| `/admin/bookings/new` | Assign tenant |
| `/admin/bookings/[bookingId]` | Cancel, offline pay, extensions, ops |
| `/admin/extensions` | → `/admin/bookings` |

#### Operations & vacating

| Route | Purpose |
|-------|---------|
| `/admin/operations` | Action center, refund requests, occupancy |
| `/admin/operations/pg/.../resident/...` | PG operations drill-down |
| `/admin/vacating` | Vacating notice approve/reject |
| `/admin/requests` | **Deprecated** — legacy refund requests |

#### Electricity & inventory

| Route | Purpose |
|-------|---------|
| `/admin/electricity` | → billing `?tab=electricity` |
| `/admin/electricity/new` | Create room electricity bill |
| `/admin/pgs`, `/admin/pgs/new`, `/admin/pgs/[pgId]/listing` | PG CRUD |
| `/admin/pgs/[pgId]/map` | Bed map (assign, vacate, flags) |
| `/admin/pgs/[pgId]/rooms` | Room/bed inventory |
| `/admin/pgs/[pgId]/collections` | PG-scoped payment proof queue |
| `/admin/rooms`, `/admin/beds`, `/admin/floors` | → `/admin/pgs` |

#### System, panel, misc

| Route | Purpose |
|-------|---------|
| `/admin/analytics` | Visitor funnel (no finance) |
| `/admin/system` | Integrations, migrations, monitoring |
| `/admin/system/financial-audit` | Cross-module reconciliation |
| `/admin/system/bed-audit` | Bed/reservation mismatch repair |
| `/admin/system/health-report` | Full health audit |
| `/admin/system/pricing-health` | Pricing consistency |
| `/admin/system/recalculate-financial` | Recalculation tool |
| `/admin/panel` | Rent audit, links, WhatsApp log, coupons, permissions |
| `/admin/monitoring`, `/admin/deployments`, `/admin/emails` | Ops tooling |
| `/admin/playstation` | PS4 membership maintenance |
| `/admin/notifications` | Admin notification inbox |
| `/admin/pricing` | Pricing center (bed rates) |
| `/admin/settings` | Read-only PG config + repair tools |
| `/admin/guide` | Searchable admin help |

---

### 1.3 API routes (57)

| Group | Routes | Purpose |
|-------|--------|---------|
| Auth | `/api/auth/customer/*`, `/api/auth/admin/*`, `/api/auth/logout` | Login, password, OTP |
| Beds | `/api/beds/[bedId]/availability`, `interest`, `reserve-quote` | Availability & reserve |
| Payments | `/api/payment-record/*`, `/api/payments/razorpay/*` | QR proofs, Razorpay |
| Proofs | `/api/rent-invoice/.../payment-proof`, electricity, extension, PS4, booking | Upload payment screenshots |
| Webhooks | `/api/webhooks/razorpay`, `mock`, `vercel` | Payment & deploy events |
| Admin | `/api/admin/deposits/.../correct-summary`, residents search, proofs, KYC PDF, notifications, live, analytics, health, monitoring, deployments | Admin operations |
| Analytics | `/api/analytics/track`, `event`, `heartbeat` | Customer tracking |
| Health | `/api/health` | Public probe |

---

### 1.4 Cron / automation

| Route | Schedule | Financial impact |
|-------|----------|------------------|
| `/api/cron/generate-monthly-rent` | Daily 02:00 UTC | Rent overdue + invoice generation |
| `/api/cron/release-holds` | Daily 04:00 UTC | Cancel expired holds |
| `/api/cron/expire-bed-reserves` | Daily 04:30 UTC | Expire bed reserves |
| `/api/cron/automation` | Daily 06:00 UTC | WhatsApp + action item sync |
| `/api/cron/bootstrap-admin` | Manual | First admin |
| `/api/cron/deploy-watchdog` | Manual/webhook | Deploy stability |
| `/api/cron/mark-pg-occupancy`, `clear-pg-occupancy` | Manual | Occupancy placeholders |

---

## 2. Permissions & roles

**Source:** `src/lib/auth/roles.ts`, `src/lib/auth/guards.ts`

| Permission | Roles | Gates |
|------------|-------|-------|
| `pgs:write` | super_admin, pg_manager | PG CRUD, bed map, rooms, PG collections |
| `bookings:write` | super_admin, pg_manager | Assign tenant, residents, booking ops, archive |
| `extensions:write` | super_admin, pg_manager | Extension request/cancel |
| `rent:write` | super_admin, accountant | Generate rent invoices, overdue, cancel pending |
| `electricity:write` | super_admin, accountant | Create electricity bills |
| `deposits:write` | super_admin, accountant | All deposit ledger, checkout settlements, financial reset |
| `vacating:write` | super_admin, pg_manager, accountant | Vacating approve/reject/complete |
| `payments:write` | super_admin, accountant | Proof approval, payment links, express collection, invoices |
| `payments:override` | super_admin only | Override offline payment validation |
| `kyc:write` | super_admin, pg_manager | Approve/reject KYC |

**PG scope:** Non–`super_admin` roles require `pgScope` membership (`adminCanAccessPg`).

**Navigation gap:** Sidebar shows all modules for any logged-in admin; permission checks occur at page/action level only (`src/components/admin/navItems.ts`, `src/lib/admin/navigation.ts`).

---

## 3. Workflow maps

### 3.1 Customer booking flow

```
Browse PG → Room → Bed → /booking/new (cart)
  → createBookingAction → /booking/[code]/pay (UPI + proof)
  → webhook confirm → /payment-success or /booking/[code]
  → KYC if not approved → bed assignment (admin)
```

**Key files:** `app/(customer)/booking/new/`, `BookingCheckoutExperience.tsx`, `src/services/booking.ts`, `src/services/bookingLifecycle.ts`

**Alternate:** `/reserve/new` → reserve booking → same pay path.

**Retired:** Extend stay (`canExtend = false`; `/extend` redirects).

---

### 3.2 KYC flow

| State | `customers.kyc_status` | Submission | UI |
|-------|------------------------|------------|-----|
| Not started | `pending` (default) | none | Complete identity verification |
| Under review | `pending` | `pending` | Documents under review |
| Approved | `approved` | `approved` | Verified — check-in allowed |
| Rejected | `rejected` | `rejected` | Resubmit |

**Transitions:** `src/services/kyc.ts` (`submitKyc`, `reviewKycSubmission`)  
**Check-in gate:** `canCheckIn()` = KYC approved (`src/services/profile.ts`)  
**UI:** `/account/profile?section=identity`, `KycIdentitySection.tsx`

---

### 3.3 Deposit flow (admin + resident)

**Collection:** Checkout pay → `recordDepositCollected` → `deposit_ledger`  
**Partial deposit:** `deposit_collection_status` = partial/overdue; pay later via link  
**Admin correction:** `DepositCorrectForm` → `POST /api/admin/deposits/[bookingId]/correct-summary`  
**Admin views:** List (`depositInvoices.ts`), detail (`loadDepositPageData.ts`)  
**Settlement:** Checkout settlement → `depositSettlement.ts` → ledger deductions/refund  
**Resident:** `DepositDueSection`, `DepositWalletSection`, `DepositRefundRequestForm`

**Status layers (do not collapse in UI redesign):**

| Layer | Values | Source |
|-------|--------|--------|
| Booking collection | pending, full, partial, overdue, waived | `bookings.deposit_collection_status` |
| Deposit invoice | collecting, held, refund_pending, settled | `depositInvoices.ts` |
| Admin refund flag | unknown, pending, refunded, blocked, not_applicable | `bookings.admin_deposit_refund_status` |

---

### 3.4 Vacating & checkout settlement

**Resident:**
1. Submit notice → `/account/resident/request-vacating/[bookingId]`
2. Timeline: `VacatingJourneyTimeline` (7 stages)
3. After approval → deposit refund request (meter + UPI)

**Admin:**
1. `/admin/vacating` — approve/reject notice
2. `/admin/checkout-settlements/[id]` — electricity, charges, approve refund
3. `markCheckoutRefundPaid` → `settleDepositRefund`

**Legacy:** `/admin/requests` deprecated; `completeVacatingRequest` pre-unified path still in code.

---

### 3.5 Admin billing flow

**Canonical URL:** `/admin/revenue/billing`

| Tab | Workflow |
|-----|----------|
| Billing queue | Outstanding items across rent/elec/deposit |
| Approvals | QR payment proof approve/reject |
| Rent | Generate invoices, bulk send, WhatsApp |
| Electricity | Send bills, proof approval |
| Paid | History |

**Quick actions:** `app/(admin)/admin/quick-actions/` — advance deposit, express collection, refund settlement.

---

### 3.6 Assign tenant (multiple entry points)

Same underlying flow from:
- `/admin/bookings/new`
- `/admin/residents` header
- Resident profile assign form
- Bed map assign

**Action:** `assignTenantAction` (`bookings:write`)

---

## 4. Financial calculation inventory (reference only)

**SSOT for resident display:** `src/services/residentFinancialEngine.ts`  
**SSOT for deposit money:** `deposit_ledger` via `src/services/deposits.ts`  
**SSOT for admin deposit view:** `src/services/depositInvoices.ts`, `depositOperations.ts`

| Module | Path | Computes |
|--------|------|----------|
| Pricing | `src/services/pricing.ts` | Quotes by duration mode, security deposit |
| Billing policy | `src/services/billing.ts` | Late fees, pro-ration, vacating penalty, elec split |
| Rent invoices | `src/services/rentInvoices.ts` | Monthly rent, overdue |
| Electricity | `src/services/electricityBilling.ts` | Room bill split |
| Deposits | `src/services/deposits.ts` | Ledger collected/deducted/refunded |
| Deposit collection | `src/services/depositCollection.ts` | Rent vs deposit split, due sync |
| Deposit settlement | `src/services/depositSettlement.ts` | Refunds, canonical deductions |
| Checkout settlement | `src/services/checkoutSettlement.ts` | Vacating final refund |
| Cancellation | `src/services/cancellationPolicy.ts` | Refund tiers (snapshotted) |
| Coupons | `src/lib/dateCoupon.ts` | 10% off rent subtotal only |
| Unified invoices | `src/services/unifiedInvoices.ts` | `financial_invoices` registry |
| Express collection | `src/services/expressCollection.ts` | Offline already-collected money |

**Display-only (not ledger):** `src/lib/deposits/unifiedDepositView.ts` — effective collected/refundable caps for admin UI.

---

## 5. Duplicate & overlapping screens

| Overlap | Routes | Issue |
|---------|--------|-------|
| Billing hub fragmentation | `/admin/collections`, `/admin/rent`, `/admin/electricity`, `/admin/payments` | All redirect to `/admin/revenue/billing`; mental model split across 4 sidebar memories |
| Deposits vs billing vs invoices | `/admin/deposits`, billing deposit queue, `/admin/invoices`, `/admin/deposits/collected` | Same money in 4 admin surfaces |
| Resident financial drill-down | `/admin/residents/[id]`, `/admin/revenue/pg/.../resident/...`, `/admin/collections/pg/...`, `/admin/operations/pg/...` | Same `PgResidentIndex` pattern × 4 modules |
| Vacating vs checkout vs requests | `/admin/vacating`, `/admin/checkout-settlements`, `/admin/requests` | Requests deprecated but linked; two-step vacating→settlement |
| KYC paths | `/admin/kyc/*` vs `/admin/residents/kyc/*` | Legacy redirects |
| PG proof approval | Global billing approvals tab vs `/admin/pgs/[pgId]/collections` | Duplicate approval queues |
| Assign tenant | Bookings new, residents list, profile, bed map | 4 entry points, same form |
| Customer account aliases | `/account/kyc`, `/account/resident`, `/account/wallet`, `/account/payments` | 4 URLs → 1 profile with query params |
| Resident vacating | Vacating tab + Requests tab + Home tab forms | Same vacating/refund in 3 places |
| Revenue vs overview | `/admin/revenue` vs `/admin/overview` | Both show financial KPIs at different depth |
| Customer bookings vs resident hub | `/account/bookings` vs resident home | Short-stay vs monthly split confuses residents |

---

## 6. Screens with >5 primary actions

Primary actions = main CTAs that mutate state or open workflows (excludes nav, breadcrumbs, table row links, filter tabs).

| Screen | ~Count | Examples |
|--------|--------|----------|
| **`/admin/residents/[customerId]`** | **15+** | Express collection, charge generator, 9 invoice presets, WhatsApp ×4, edit rent/deposit, KYC verify, archive |
| **`/admin/revenue/billing`** (billing tab) | **8+** | Generate all/due, mark overdue, bulk send, per-row send/WhatsApp |
| **`/admin/deposits/[bookingId]`** | **7+** | Correct, add/deduct/refund, settle, reconcile, advanced tools |
| **`/admin/checkout-settlements/[id]`** | **6+** | Approve, mark paid, save, rebuild, archive, delete |
| **`/admin/bookings/[bookingId]`** | **5–6** | Cancel, offline pay, extension, ops panel |
| **Resident Home** (`tab=home`) | **10+** | Pay deposit, extend deposit, PS4, vacating, refund, per-invoice Pay ×N |
| **Booking detail** (pending) | **6+** | Pay, KYC, cancel, extension pay, navigation |
| **Requests tab** | **10 cards** | Only 2 wired in-app; rest WhatsApp |

---

## 7. Jargon & confusing labels

### Admin

| Term | Where | Risk |
|------|-------|------|
| SSOT | Internal docs, some UI copy | Operator confusion |
| Ledger / wallet / invoice | Deposits module | Three words for related but distinct concepts |
| Collecting / held / settled | Deposit status | Overlaps booking `deposit_collection_status` |
| Checkout settlement | Vacating flow | Not “checkout” in customer sense |
| Express collection | Billing | Sounds like shipping |
| Historical payment | Paid tab | Means offline already collected |
| Action items / sync | Overview | Ops jargon |
| pg scope | Permissions | Hidden from most UI |
| Adjusted (`waived` label) | Deposit collection | Admin correction vs resident waiver |

### Customer / resident

| Term | Where | Risk |
|------|-------|------|
| KYC | Identity tab | Acronym without plain-language lead |
| Open-ended | Stay duration | Technical |
| Duration modes | daily/weekly/monthly/fixed_stay/reserve | `reserve` especially opaque |
| Deposit wallet / credit | Wallet tab | vs “security deposit balance” |
| Checkout settlement | Vacating timeline | Admin term on resident UI |
| Principal / accrued late fee | Invoice tables | Accounting jargon |
| “Same totals as your PG admin sees” | Financial summary | Breaks resident mental model |
| Admin dues / refund not reviewed | Status pills | Back-office labels exposed |
| Proof submitted | Invoice status | Informal |
| X ways split | Electricity invoice | Unclear occupant split |

---

## 8. Resident simplification opportunities (presentation only)

1. **Single “What to do now” card** on Home — max 3 CTAs; invoices behind “View all bills” (`ResidentAreaSection.tsx` is ~800 lines).
2. **Unify mobile/desktop nav** — 9 desktop tabs vs 5 mobile; mobile “Profile” icon opens `room` tab, not account profile.
3. **Remove extend dead ends** — hide legacy extension UI; single “Contact support to extend” message.
4. **One vacating path** — Vacating tab only; remove duplicate refund form on Home when no approved vacating.
5. **Requests tab trim** — show 2 wired flows + one WhatsApp card (not 10 similar cards).
6. **Plain-language status** — replace admin ops pills on resident UI.
7. **KYC states** — “Not started” vs “Waiting for review” instead of bare `pending`.
8. **One checkout stepper** — merge `BookingFlowStepper` + `CheckoutProgressStepper` on pay page.
9. **Default home for monthly residents** — resident tab after first confirmed booking.
10. **Shared pay component** — rent, electricity, deposit due, booking pay share UPI+proof pattern.
11. **Link `/guide`** from KYC, vacating policy, deposit refund forms.
12. **Middleware** — add `/reserve/*` and `/pay/*` for consistent login redirect.

---

## 9. Key file index

| Area | Files |
|------|-------|
| Admin nav | `src/lib/admin/navigation.ts`, `src/components/admin/navItems.ts` |
| Permissions | `src/lib/auth/roles.ts`, `src/lib/auth/guards.ts` |
| Customer nav | `src/lib/accountNavigation.ts` |
| Booking | `src/services/booking.ts`, `src/services/bookingLifecycle.ts` |
| Deposits | `src/services/deposits.ts`, `depositInvoices.ts`, `depositOperations.ts`, `depositSettlement.ts` |
| Vacating | `src/services/vacating.ts`, `checkoutSettlement.ts` |
| KYC | `src/services/kyc.ts`, `src/db/schema/enums.ts` |
| Resident UI | `src/components/customer/account/ResidentAreaSection.tsx`, `ResidentHubShell.tsx` |
| Admin resident | `app/(admin)/admin/residents/[customerId]/page.tsx` |
| Billing hub | `app/(admin)/admin/revenue/billing/page.tsx` |
| Financial SSOT | `src/services/residentFinancialEngine.ts` |

---

*End of Phase 1 feature inventory. Do not begin design system or page redesign until `redesign-roadmap.md` is approved.*

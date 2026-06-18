# Awesome PG — Master Product & Technical Documentation (Volume 2)

**Version:** 2.0 (post–Master Guide v1)  
**Last updated:** 2026-06-17  
**Repository:** `awesomepg`  
**Companion:** [AWESOME_PG_MASTER_DOCUMENTATION.md](./AWESOME_PG_MASTER_DOCUMENTATION.md) (Master Guide v1 — Phase 3.3 baseline)

---

## How to use this document

Master Guide **v1** is the baseline for the whole platform (~100 pages, schema, customer/admin journeys, financial architecture). **This volume documents everything built after v1 was written** (commit `f2cdaa9`, 2026-06-16) through production deploy `b8a1fe2`.

Read v1 first for core concepts (bed reservations, `residentFinancialEngine`, half-open `[start, end)` ranges, GiST EXCLUDE). Use **v2** for:

| Question | Go to |
|----------|-------|
| How does the Action Center sync and execute tasks? | [§11 Action Center](#part-11--action-center--payment-links) |
| How do I generate deposit/rent/custom charge links? | [§12 Resident charge generator](#part-12--resident-charge-generator) |
| How do I record money already collected offline? | [§13 Express collection](#part-13--express-collection) |
| How does the fixed-stay date picker work? | [§14 Fixed-stay picker & bed overlap](#part-14--fixed-stay-picker--bed-overlap) |
| What was hardened in the security audit? | [§15 Security hardening](#part-15--security-hardening) |
| What env vars / migrations for deploy? | [§16 Deploy & smoke tests](#part-16--deployment--smoke-tests) |
| What changed commit-by-commit? | [Appendix A — Changelog](#appendix-a--post-v1-commit-changelog) |

**In-app checklists (optional UI, not a substitute for this doc):**

- Guide 1 · Ops → `/admin/panel?tab=guide`
- Guide 2 · Security → `/admin/panel?tab=guide2`

---

## Table of contents

11. [Action Center & payment links](#part-11--action-center--payment-links)
12. [Resident charge generator](#part-12--resident-charge-generator)
13. [Express collection](#part-13--express-collection)
14. [Fixed-stay picker & bed overlap](#part-14--fixed-stay-picker--bed-overlap)
15. [Security hardening](#part-15--security-hardening)
16. [Deployment & smoke tests](#part-16--deployment--smoke-tests)
- [Appendix A — Post-v1 commit changelog](#appendix-a--post-v1-commit-changelog)
- [Appendix B — New services & files index](#appendix-b--new-services--files-index)
- [Appendix C — Test coverage matrix](#appendix-c--test-coverage-matrix)
- [Appendix D — Residual risks & never-change rules](#appendix-d--residual-risks--never-change-rules)

---

# PART 11 — ACTION CENTER & PAYMENT LINKS

**Migration:** `0038_action_center.sql`  
**Shipped:** commit `79031fb` (before v1 doc; **not** detailed in v1)

## Purpose

Synced operator task queue derived from live billing/KYC/vacating/payment-proof state. Admins **sync**, **review**, and **execute** tasks (WhatsApp, email, payment link) from Overview, Operations, or the global Action Drawer.

## Routes & pages

| Route | Purpose |
|-------|---------|
| `/admin/overview` | Control board KPI cards + **Sync now** + drill-down drawer |
| `/admin/operations` | Full action list (`ActionCenter`) |
| `/admin/actions` | Redirect → overview (legacy URL) |
| `/admin/notifications` | Parallel admin inbox (mirrors action sync) |
| `/admin/panel?tab=links` | Payment link audit table |
| `/admin/panel?tab=whatsapp` | Prepared WhatsApp message log |

## Schema (`0038`)

| Table | Role |
|-------|------|
| `action_items` | One row per open/resolved operator task; unique `source_key` for idempotent sync |
| `payment_links` | UPI links with lifecycle `active` → `paid` / `expired` |

**Enums:** action item types, priorities, statuses (see `src/db/schema/enums.ts`).

## Services

| File | Responsibility |
|------|----------------|
| `actionItems.ts` | `syncActionItems()`, list/filter, upsert by `source_key`, PG scope filter |
| `actionExecution.ts` | Execute drawer actions (WhatsApp URL, email, create payment link) |
| `paymentLinks.ts` | Create link, mark paid/expired, public URL |
| `adminNotifications.ts` | Mirror action items into admin notification feed |
| `residentRequestActions.ts` | Sync resident-request rows into action center |

## UI components

| Component | Location |
|-----------|----------|
| `ActionCenter.tsx` | Operations page list |
| `ActionDrawer.tsx` | Global drawer (layout provider) |
| `AdminActionDrawerProvider.tsx` | `app/(admin)/layout.tsx` |
| `SyncActionsButton.tsx` | Overview / Operations header |
| `BulkBillingWhatsAppReminder.tsx` | Bulk WhatsApp from control board |
| `ControlBoard.tsx` | Overview KPI drill-down |

## Server actions

`app/(admin)/admin/actions/actions.ts` — sync, resolve, execute.

## Workflow

```
1. Cron or admin clicks "Sync now"
   → syncActionItems() scans rent/KYC/vacating/proof queues
   → upserts action_items by source_key
   → syncAdminNotificationsFromActionItems()

2. Admin clicks action row
   → ActionDrawer opens with context (resident, amount, ledger snippet)

3. Admin executes (WhatsApp / link / email)
   → actionExecution.ts
   → optional payment_links row + whatsapp log entry

4. Admin marks resolved
   → status = resolved; item drops from open queue on next sync if source cleared
```

## Cron

`/api/cron/automation` → `syncActionItemsForCron()` (see `vercel.json` schedule `0 6 * * *`).

## Connected ops (Guide 1 · Ops checklist)

Documented in `AdminPanelGuide.tsx`:

- Rent edit → audit + invoices + action items + Overview rent card
- WhatsApp + payment links on Residents, Collections, Deposits
- KYC review queue
- Overview control board clickable KPIs
- Payment link lifecycle (30-day expiry)
- Date coupons (DDMMYY) — booking checkout only, partial
- Permissions tab — read-only roles

---

# PART 12 — RESIDENT CHARGE GENERATOR

**Migration:** `0051_resident_charge_generator.sql`  
**Shipped:** commit `35b4738`

## Purpose

Admins create **structured charges** (additional deposit, adhoc rent, electricity, custom) with auto-generated **payment links**, WhatsApp share URLs, and resident **proof upload** on `/pay/{linkId}`.

## Routes

| Route | Access | Purpose |
|-------|--------|---------|
| `/admin/residents/[customerId]` | Admin + PG scope | `CreateChargeGeneratorForm` |
| `/pay/[linkId]` | Customer session + link owner | QR, breakdown, proof upload |
| `/admin/panel?tab=links` | Admin | Link status audit |

## Schema changes (`0051`)

**`rent_invoices`**

- `is_adhoc boolean` — allows multiple rent invoices per booking/month when adhoc
- Partial unique index: `(booking_id, billing_month) WHERE is_adhoc = false`

**`payment_links`** (extensions)

| Column | Purpose |
|--------|---------|
| `title`, `description` | Display on pay page |
| `payment_proof_url` | Resident-uploaded proof |
| `booking_id` | Deposit / booking-linked charges |
| `rent_invoice_id` | Rent charge links |
| `created_by_admin_id` | Audit |

## Services

| File | Role |
|------|------|
| `residentCharges.ts` | `createResidentCharge()`, `submitDepositLinkPaymentProof()` |
| `paymentLinks.ts` | Link CRUD + lifecycle |
| `rentInvoices.ts` | `createAdhocRentInvoice()` |
| `unifiedInvoices.ts` | Custom charge invoices |
| `paymentProofQueue.ts` | Admin approval queue |

## Charge types (`chargeGeneratorConstants.ts`)

- `additional_deposit`
- `rent_charge`
- `electricity_charge`
- `custom_charge`

## Workflow

```
Admin → Resident profile → Create charge
  → createResidentCharge()
  → invoice and/or payment_links row
  → WhatsApp share URL in success banner

Resident → /pay/{linkId} (must match session.residentId)
  → UPI QR + amount breakdown
  → upload proof → submitDepositLinkPaymentProof(linkId, residentId, url)

Admin → Collections approval queue
  → approve proof → invoice paid / deposit collected
```

## Security (post-`15406c6`)

- `/pay/[linkId]` page requires customer session; `residentId` must match link owner
- `submitDepositLinkPaymentProof` validates ownership in **service layer** (`residentCharges.ts`)

---

# PART 13 — EXPRESS COLLECTION

**Shipped:** commit `f2cdaa9` (same commit as Master Guide v1 file; **feature not documented in v1**)

## Purpose

Record **money already collected** (cash/UPI/bank/Razorpay) for historical or offline payments **without** creating outstanding debt or payment links.

## Routes & UI

| Location | Component |
|----------|-----------|
| `/admin/residents/[customerId]` | `ExpressCollectionButton`, `CollectionsHistoricalPaymentPanel` inside `FinancialCommandCenter` |

## Server actions

`app/(admin)/admin/residents/[customerId]/expressCollectionActions.ts`  
(PG scope via `assertAdminCustomerBookingAccess` after security hardening.)

## Service

`src/services/expressCollection.ts` — `recordExpressCollection()`

## Charge types (`expressCollectionConstants.ts`)

`rent` · `deposit` · `electricity` · `ps4` · `custom`

## Payment methods

`cash` · `upi` · `bank` · `razorpay` · `other`

## Workflow

```
Admin selects: charge type, amount, payment date, method, optional reference
  → recordExpressCollection()
  → writes paid payment + invoice directly OR marks existing invoice paid
  → deposit_ledger / rent_invoices / financial_invoices updated
  → audit_log entry (note prefix: "Express Collection — historical payment")
  → revalidateFinancialViews()

UI shows "Paid (Historical)" in Financial Command Center
```

## Schema

No dedicated migration — uses existing `payments`, `rent_invoices`, `financial_invoices`, `deposit_ledger`, `audit_log`.

## Debug tooling

`scripts/investigate-due-1132.ts` — rent trace debugging (added with express collection commit).

---

# PART 14 — FIXED-STAY PICKER & BED OVERLAP

**Shipped:** `33513dd` (picker UX), `cf36e74` (overlap logic fix), `b8a1fe2` (TS fixes)

## Purpose

Airbnb-style **range-first** date picker for fixed-stay bookings. Availability blocking uses **half-open overlap** on the **selected** date range only — unrelated future reservations do not show false warnings.

## Customer flow

```
/pgs/[pgSlug]/rooms/[roomId]
  → BedSelector → BedBookingPanel
  → StayDateRangePicker (modal)
  → /booking/new?start=&end=&mode=fixed_stay&bed=
  → BookingCartForm → quote → pay
```

## API

`GET /api/beds/[bedId]/availability?fromDate=&lookAheadDays=365`

Returns: `freeWindows`, `futureReservations`, `earliestCheckIn`, `windowEnd` (informational).

## Canonical overlap (`src/lib/bedStayOverlap.ts`)

**Rule:** bed unavailable for `[selectedStart, selectedEnd)` iff any confirmed active reservation overlaps:

```
existing.start < selected.end AND existing.end > selected.start
```

| Function | Use |
|----------|-----|
| `stayRangesOverlap()` | Pure overlap test |
| `isStayRangeAvailable()` | Blocking check for proposed stay |
| `maxCheckoutBeforeOverlap()` | Latest exclusive checkout for a check-in |
| `isCheckInAvailableForReservations()` | Check-in day not inside a reservation |
| `isCheckOutAvailableForReservations()` | Full range clear |
| `isStayRangeAvailableForAllBeds()` | Multi-bed intersection |

## Supporting modules

| File | Role |
|------|------|
| `stayDateSelection.ts` | Picker state machine (`pickStayRange`), day classification |
| `bedAvailabilityWindows.ts` | Client-safe window math + `validateStayAgainstReservations()` |
| `availability.ts` | DB queries; `isBedAvailable()` uses Postgres `&&` on `stay_range` |
| `fixedStayOptimizer.ts` | Lowest fixed-stay rent for N nights |

## UI behavior

- **No Done button** — range commits on second calendar click
- **Warning message** only when selected range **overlaps** or **exceeds checkout cap** — not when a distant future reservation exists
- **Pricing** computed strictly for selected `fixedNights` — unaffected by unrelated reservations
- Multi-bed: all beds must pass overlap checks (`reservationsByBed`)

## DB layer (unchanged principle from v1)

`bed_reservations.stay_range` GiST EXCLUDE — race-proof at storage. Service layer now matches same half-open semantics.

## Env default (`33513dd`)

`PAYMENT_PROVIDER` defaults to `mock` in development when unset (`src/lib/env.ts`).

## Visual QA scripts

- `scripts/p0-booking-browser.mjs`
- `scripts/p0-booking-visual.mjs`

---

# PART 15 — SECURITY HARDENING

**Migration:** `0052_security_hardening.sql`  
**Shipped:** commit `15406c6`  
**Audit docs:** `SECURITY_REMEDIATION.md`, `SECURITY_FOLLOWUP.md`

## Threat summary

| ID | Threat | Remediation |
|----|--------|-------------|
| T1 | Cross-PG admin via forged `bookingId` | `assertAdminBookingAccess()` on map, bookings, deposits, vacating, invoices, requests, express collection |
| T2 | Forged mock webhook confirms booking | HMAC + prod 404 + `webhook_replay_guard` |
| T3 | Deposit ledger bypass via legacy exports | `recordDepositRefunded` / `recordDepositDeducted` de-exported; canonical `depositSettlement.ts` |
| T4 | Payment link proof hijack | Session + service-layer `residentId` match |
| T5 | Offline payment underpayment | Amount must match expected unless `payments:override` (super_admin) |
| T6 | Missing production secrets | `assertProductionBootSecrets()` in `instrumentation.ts` |

## Migration `0052`

| Table | Purpose |
|-------|---------|
| `webhook_replay_guard` | `(webhook_kind, signature_digest)` unique — replay protection |
| `deposit_settlements` | Audit trail per refund/settlement; `idempotency_key` unique |

## Canonical deposit settlement (`depositSettlement.ts`)

All deposit **deductions** and **refunds** must go through:

| Export | Purpose |
|--------|---------|
| `applyDepositDeduction()` | Row lock, balance check, ledger write |
| `settleDepositRefund()` | Full/partial refund with idempotency |
| `settleDepositWithDeductions()` | Vacating / settlement panel |
| `settleVacatingDepositRefund()` | Vacating complete path |

**Removed from public API:** `recordDepositRefunded`, `recordDepositDeducted` in `deposits.ts`.

## PG access (`src/lib/auth/pgAccess.ts`)

| Helper | Resolves |
|--------|----------|
| `assertAdminBookingAccess(session, bookingId)` | PG via bed_reservations → floors |
| `assertAdminVacatingRequestAccess(session, requestId)` | Via booking PG |
| `assertAdminCustomerBookingAccess(session, customerId, bookingId?)` | Resident + PG |
| `assertAdminFinancialInvoiceAccess` / `assertAdminRentInvoiceAccess` | Invoice PG |

**Rule:** `adminCanAccessPg()` — empty `pgScope` denies non–`super_admin`.

## Mock webhook (`/api/webhooks/mock`)

| Environment | Behavior |
|-------------|----------|
| Production | **404** — route disabled |
| Dev/staging | HMAC via `MOCK_WEBHOOK_SECRET` (`mockWebhookAuth.ts`) |
| All | `verifyMockWebhookRequest` runs **before** `recordPaymentSuccess` |

## Payment links hardened

- `app/(customer)/pay/[linkId]/page.tsx` — session required; owner match
- `app/(customer)/pay/actions.ts` — proof upload gated
- `residentCharges.ts` — `submitDepositLinkPaymentProof(linkId, customerId, url)`

## Offline booking payment

`app/(admin)/admin/bookings/[bookingId]/actions.ts` — amount validation + audit on override.

## Production boot (`envHealer.ts`)

Required in production Node runtime: `AUTH_SECRET`, `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`.

## Dead code removed

- `PayButtons.tsx`, `ResidentPayButtons.tsx`
- `razorpayClient.ts`
- `app/(customer)/booking/[bookingCode]/pay/actions.ts` (slimmed customer pay paths)

## Verify scripts (staging)

- `scripts/verify-webhook-idempotency.ts`
- `scripts/verify-payment-failure.ts`
- `scripts/verify-deposit-ledger.ts`

---

# PART 16 — DEPLOYMENT & SMOKE TESTS

## Pre-production gate

1. `npm run db:migrate` — confirm `0052_security_hardening` applied
2. `npm test` — **339+** pass, 0 fail (unit + integration)
3. Env vars on Vercel (below)
4. Staging deploy → smoke tests → production

## Environment variables

**Production (required):**

```
AUTH_SECRET=...
CRON_SECRET=...
BLOB_READ_WRITE_TOKEN=...
PAYMENT_PROVIDER=razorpay
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
```

**Staging / dev (mock payments):**

```
MOCK_WEBHOOK_SECRET=...
```

## Build

- Local: `npm run build` (TypeScript + Next.js)
- Vercel: `vercel-build` → `npm run db:migrate && next build`

## Production URLs

- https://www.awesomepg.in
- Vercel project: `awesomepg-k59k`

**Note:** Git push to `main` may not auto-trigger Vercel if Git integration is disconnected. Manual deploy: `npx vercel deploy --prod` from linked CLI.

## Security smoke test (~10 min)

| Flow | Steps |
|------|-------|
| Booking | Create → QR pay → admin approve → confirmed |
| Deposit | Check-in → collect → deduct → refund → balances correct |
| Vacating | Request → complete → `deposit_settlements` row |
| Payment links | Resident A opens own link; Resident B blocked |
| PG scope | Scoped admin denied on other PG bed map action |
| Mock webhook | Unsigned POST → 401; no payment row |
| Fixed-stay dates | Select 7 nights with distant future reservation → **no false warning** |

## Searchable admin help

`/admin/guide` — articles under **Security & deploy** category in `adminGuide.ts` (search: scope, deposit settlement, deploy).

---

# APPENDIX A — POST-V1 COMMIT CHANGELOG

| Commit | Date | Summary |
|--------|------|---------|
| `f2cdaa9` | 2026-06-16 | Express collection + **Master Guide v1** doc |
| `33513dd` | 2026-06-16 | Fixed-stay date picker; default `PAYMENT_PROVIDER=mock` |
| `15406c6` | 2026-06-17 | Security hardening (0052, pgAccess, depositSettlement, mock webhook) |
| `cf36e74` | 2026-06-17 | Bed overlap fix; Admin Panel Guide 2 tab |
| `b8a1fe2` | 2026-06-17 | TypeScript fixes for Vercel build |

**Also shipped before v1 doc (documented here, not in v1):**

| Commit | Feature |
|--------|---------|
| `79031fb` | Action Center (`0038`) |
| `35b4738` | Resident charge generator (`0051`) |

---

# APPENDIX B — NEW SERVICES & FILES INDEX

| Path | Volume 2 feature |
|------|------------------|
| `src/services/actionItems.ts` | Action Center sync |
| `src/services/actionExecution.ts` | Drawer execution |
| `src/services/residentCharges.ts` | Charge generator + proof |
| `src/services/expressCollection.ts` | Historical payments |
| `src/services/depositSettlement.ts` | Canonical deposit mutations |
| `src/lib/auth/pgAccess.ts` | PG scope guards |
| `src/lib/payments/mockWebhookAuth.ts` | Mock webhook HMAC |
| `src/lib/bedStayOverlap.ts` | Overlap math SSOT |
| `src/lib/stayDateSelection.ts` | Date picker logic |
| `src/components/admin/ActionCenter.tsx` | Operations queue UI |
| `src/components/admin/ActionDrawer.tsx` | Global action drawer |
| `src/components/admin/AdminPanelGuide.tsx` | In-app Guide 1 · Ops |
| `src/components/admin/AdminPanelGuide2.tsx` | In-app Guide 2 · Security |
| `src/components/admin/CreateChargeGeneratorForm.tsx` | Charge generator UI |
| `src/components/admin/ExpressCollectionButton.tsx` | Express collection UI |
| `src/db/migrations/0038_action_center.sql` | Action items + payment links base |
| `src/db/migrations/0051_resident_charge_generator.sql` | Adhoc rent + link columns |
| `src/db/migrations/0052_security_hardening.sql` | Replay guard + settlements |

---

# APPENDIX C — TEST COVERAGE MATRIX

| Feature | Test files |
|---------|------------|
| Bed overlap | `tests/unit/bedStayOverlap.test.ts` |
| Date picker | `tests/unit/stayDateSelection.test.ts`, `tests/unit/stayDatePickerAcceptance.test.ts` |
| Availability windows | `tests/unit/availability.test.ts` |
| Deposit settlement | `tests/unit/depositSettlement.test.ts` |
| PG access | `tests/unit/adminPgAccess.test.ts` |
| Map PG scope | `tests/unit/mapActionsPgScope.test.ts` |
| Mock webhook | `tests/unit/mockWebhookSecurity.test.ts`, `tests/integration/mockWebhookRoute.test.ts` |
| Payment link proof | `tests/unit/paymentLinkProof.test.ts` |
| Production boot | `tests/unit/productionHardening.test.ts` |
| Migration health | `tests/unit/migrationHealth.test.ts` (includes 0052) |
| Action Center | *(no dedicated tests — use manual smoke)* |
| Express collection | *(no dedicated tests — use manual smoke)* |
| Charge generator | Partial via `paymentLinkProof.test.ts` |

**Run:** `npm test` → expect 339 pass / 0 fail.

---

# APPENDIX D — RESIDUAL RISKS & NEVER-CHANGE RULES

## Residual risks (post-hardening)

- `adminRemoveTenantFromBed` trusts action-layer PG scope — add service check if new callers appear
- Manual partial deposit refunds use fresh idempotency keys — avoid double-click
- Customer PII encryption at rest — planned (`customers.ts` TODO)
- Vercel Git auto-deploy may not fire — verify integration or deploy via CLI

## Inherited from v1 — still never change

- `bed_reservations` GiST EXCLUDE as occupancy SSOT
- `deposit_ledger` append-only
- `pricing_snapshot` frozen at checkout
- `residentFinancialEngine` as money SSOT
- Half-open `[start, end)` everywhere

## New never-bypass rules (v2)

- **Never** export direct deposit refund/deduct helpers bypassing `depositSettlement.ts`
- **Never** call `recordPaymentSuccess` before webhook auth verification
- **Never** show availability warnings based on unrelated future reservations — use `bedStayOverlap` only
- **Never** skip `assertAdmin*Access` on new admin financial mutations

---

*End of Awesome PG Master Documentation v2.0*

*Previous volume: [AWESOME_PG_MASTER_DOCUMENTATION.md](./AWESOME_PG_MASTER_DOCUMENTATION.md)*

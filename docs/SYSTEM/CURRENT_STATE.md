# Current State

> Last updated: **2026-06-21**  
> Sync with [[CHANGELOG]] after every completed task.

---

## Current priority

1. **Stabilize vacating / checkout ops** — ensure `/admin/vacating` and [[Operations]] move-out queue work end-to-end after Date-serialization fix (`d4c01c6`).
2. **Approve pending move-outs** — e.g. residents with notice filed but not yet approved (Mohd Aatif scenario).
3. **Complete checkout settlements** — residents in `approved` + `awaiting_resident_details` / `refund_pending` (Harish scenario).
4. **Consolidate admin actions** — primary actions live in [[Operations]], [[Billing]], [[Vacating]], and checkout settlements; reduce duplicate entry points ([[DECISIONS#Operations as action hub]]).

---

## Completed systems

| System | Status | Key routes / services |
|--------|--------|------------------------|
| Public booking + checkout | ✅ Production | `/booking/new`, `bookingLifecycle.ts` |
| Monthly rent billing | ✅ Production | `rentInvoices.ts`, `/admin/revenue/billing` |
| Electricity (meter + average) | ✅ Production | `meterElectricity.ts`, `/admin/electricity` |
| Deposit wallet + ledger | ✅ Production | `deposits.ts`, `/admin/deposits/[bookingId]` |
| [[KYC]] queue | ✅ Production | `/admin/residents/kyc` |
| [[Bed Assignment]] + bed map | ✅ Production | `/admin/pgs/[pgId]/map`, `occupancySsot.ts` |
| [[Vacating]] pipeline UI | ✅ Production | `/admin/vacating`, `moveOutPipeline.ts` |
| Checkout settlements | ✅ Production | `/admin/checkout-settlements`, `checkoutSettlement.ts` |
| Vacating checkout rent sync | ✅ Production | `vacatingCheckoutBilling.ts` (submit + approve) |
| Unified invoices | ✅ Production | `/admin/invoices`, `unifiedInvoices.ts` |
| Action Center + payment links | ✅ Production | `/admin/operations`, `actionItems.ts` |
| Resident hub (account) | ✅ Production | `/account/profile?section=resident` |
| Express collection / walk-in | ✅ Production | resident profile, `expressCollection` |
| Bed assignment SSOT fix | ✅ Shipped `88a16e8` | `occupancySsot.ts`, revalidation |

---

## In progress

| Item | Notes |
|------|-------|
| Admin UX consolidation | Too many duplicate vacating/deposit/refund entry points across profile, bed map, overview — target: [[Operations]] + module hubs only |
| Obsidian second brain | This `/docs` knowledge base (initial creation 2026-06-21) |

---

## Upcoming work

- Auto-sync [[CHANGELOG]] via agent rule (documented in [[AI_CONTEXT]])
- Reduce legacy redirects (`/admin/requests`, `/admin/collections`, etc.) — see [[ROUTES#Legacy redirects]]
- Resident checkout settlement self-serve (meter + UPI) only after approve + vacate date — enforced in UI, verify all entry paths
- Optional: approve move-out inline from [[Operations]] queue without visiting `/admin/vacating`

---

## Known issues

See [[BUGS]] for full list. Highlights:

| Issue | Severity | Status |
|-------|----------|--------|
| `/admin/vacating` crash (Date serialization) | Critical | **Fixed** `d4c01c6` — await deploy |
| Lifecycle timeline scroll on Operations | Low | **Fixed** `d4c01c6` (ScrollToHash + resident map) |
| Vacating rows missing `customerId` in ops queue | Medium | **Fixed** `d4c01c6` |
| Timeline showed meter step before vacate date | Medium | **Fixed** `d4c01c6` (`vacatingJourney.ts`) |
| Bed map vs residents list assignment mismatch | Medium | **Fixed** `88a16e8` |

---

## Technical debt

| Area | Description |
|------|-------------|
| Duplicate vacating UIs | `/admin/vacating`, operations queue, resident profile, bed map, checkout settlements |
| Legacy routes | Many `/admin/*` paths redirect to canonical hubs |
| `listResidentsForAdmin` LIMIT 200 | May miss older vacated residents in ops timeline |
| Half-open range UX | Same-day checkout edge case documented in tests — admin must not shorten stay before completion |
| Master doc split | `AWESOME_PG_MASTER_DOCUMENTATION_V2.md` + this brain — keep cross-linked |
| Test coverage | Strong unit tests for billing/vacating math; fewer E2E for admin flows |

---

## Production status

- **Branch:** `main`
- **Latest commits:** `d4c01c6` (vacating/ops fix), `369bddb` (checkout-month rent), `88a16e8` (bed assignment)
- **Deploy:** Vercel auto-deploy from `main`
- **Migrations:** Applied via `npm run db:migrate` on Vercel build

---

## Related

[[README]] · [[AI_CONTEXT]] · [[features]] · [[ARCHITECTURE]] · [[ROUTES]] · [[BUGS]] · [[CHANGELOG]] · [[HANDOVER]]

<!-- DOC_SYNC_STATE_START -->
## Automated doc sync

> **Last sync:** 2026-06-21 18:33:10 UTC  
> **Areas touched:** [[Vacating]]  
> **Docs flagged:** CHANGELOG.md, CURRENT_STATE.md, DECISIONS.md, FEATURES.md, WORKFLOWS.md  
> **Staged code files:** 6  
> **Action:** Review [[CHANGELOG#Pending pre-commit sync · 2026-06-21]] (Pending section) before push.
<!-- DOC_SYNC_STATE_END -->

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
> **2026-07-03 00:04:40 UTC** — Code changed in: Database. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-04 -->
> **2026-07-04 07:42:32 UTC** — Code changed in: Routes. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-05 -->
> **2026-07-05 10:29:21 UTC** — Code changed in: Routes, Database, Billing, Bookings, Vacating. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-06 -->
> **2026-07-06 16:04:00 UTC** — Code changed in: Database. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-07 -->
> **2026-07-07 06:19:57 UTC** — Code changed in: Database, Billing. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-08 -->
> **2026-07-08 08:33:09 UTC** — Code changed in: Routes, Billing. Manual review recommended.

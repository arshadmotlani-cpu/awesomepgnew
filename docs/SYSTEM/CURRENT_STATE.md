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

<!-- DOC_SYNC_TOUCH_2026-07-09 -->
> **2026-07-09 08:00:44 UTC** — Code changed in: Routes, Billing, Bookings. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-10 -->
> **2026-07-10 09:24:52 UTC** — Code changed in: Bed Assignment, Bookings. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-11 -->
> **2026-07-11 04:31:31 UTC** — Code changed in: Routes, Auth. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-15 -->
> **2026-07-15 07:05:30 UTC** — Code changed in: Routes, Database. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-21 -->
> **2026-07-21 08:32:20 UTC** — Code changed in: Routes, Bed Assignment, Bookings, Residents, Vacating. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-22 -->
> **2026-07-22 04:46:18 UTC** — Code changed in: Routes, Database, Billing, Bookings. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-23 -->
> **2026-07-23 03:49:01 UTC** — Code changed in: Routes. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-24 -->
> **2026-07-24 04:40:42 UTC** — Code changed in: Routes, Database, Vacating, Bookings. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-25 -->
> **2026-07-25 05:14:15 UTC** — Code changed in: Vacating. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-26 -->
> **2026-07-26 00:36:00 UTC** — Code changed in: Routes. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-27 -->
> **2026-07-27 11:09:13 UTC** — Code changed in: Routes, Database, Billing, Bookings. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-28 -->
> **2026-07-28 05:16:13 UTC** — Code changed in: Routes, Billing. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-29 -->
> **2026-07-29 04:28:02 UTC** — Code changed in: Routes, Bookings, Billing. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-30 -->
> **2026-07-30 09:04:12 UTC** — Code changed in: Routes. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-07-31 -->
> **2026-07-31 02:33:53 UTC** — Code changed in: Routes. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-01 -->
> **2026-08-01 10:14:30 UTC** — Code changed in: Routes, Billing, Residents, Bookings, Deposits. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-02 -->
> **2026-08-02 07:48:39 UTC** — Code changed in: Routes, Database, Billing, Bookings, Deposits, Electricity, Residents, Vacating. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-03 -->
> **2026-08-03 05:47:05 UTC** — Code changed in: Routes, Database, Billing, Electricity. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-04 -->
> **2026-08-04 09:35:45 UTC** — Code changed in: Routes. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-05 -->
> **2026-08-05 01:42:31 UTC** — Code changed in: Routes, Billing, Residents, Electricity. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-06 -->
> **2026-08-06 03:31:23 UTC** — Code changed in: Routes. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-13 -->
> **2026-08-13 05:02:27 UTC** — Code changed in: Routes, Database. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-14 -->
> **2026-08-14 18:24:18 UTC** — Code changed in: Routes. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-15 -->
> **2026-08-15 00:14:59 UTC** — Code changed in: Residents, Vacating. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-16 -->
> **2026-08-16 09:56:08 UTC** — Code changed in: Billing, Residents. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-17 -->
> **2026-08-17 05:27:10 UTC** — Code changed in: Routes. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-18 -->
> **2026-08-18 09:35:47 UTC** — Code changed in: Routes. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-19 -->
> **2026-08-19 17:04:28 UTC** — Code changed in: Routes. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-20 -->
> **2026-08-20 01:30:34 UTC** — Code changed in: Routes, Auth. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-22 -->
> **2026-08-22 11:06:44 UTC** — Code changed in: Routes. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-23 -->
> **2026-08-23 04:13:23 UTC** — Code changed in: Residents, Vacating. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-24 -->
> **2026-08-24 08:51:14 UTC** — Code changed in: Routes, Vacating. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-25 -->
> **2026-08-25 08:30:39 UTC** — Code changed in: Routes. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-26 -->
> **2026-08-26 10:49:21 UTC** — Code changed in: Routes, Billing. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-27 -->
> **2026-08-27 11:57:18 UTC** — Code changed in: Billing, Residents, Vacating. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-29 -->
> **2026-08-29 05:59:39 UTC** — Code changed in: Routes. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-30 -->
> **2026-08-30 07:30:20 UTC** — Code changed in: Routes. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-08-31 -->
> **2026-08-31 13:39:33 UTC** — Code changed in: Routes. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-09-01 -->
> **2026-09-01 08:31:49 UTC** — Code changed in: Residents. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-09-02 -->
> **2026-09-02 05:57:27 UTC** — Code changed in: Billing, Vacating. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-09-03 -->
> **2026-09-03 05:08:08 UTC** — Code changed in: Billing, Bed Assignment. Manual review recommended.

<!-- DOC_SYNC_TOUCH_2026-09-04 -->
> **2026-09-04 07:23:51 UTC** — Code changed in: Routes, Billing. Manual review recommended.

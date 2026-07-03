# Payment Proof Approval Pipeline — Architecture Audit

**Date:** 2026-07-03  
**Scope:** Rent · Electricity · Deposit · Booking · Extension  
**Status:** Read-only audit — implementation not started  

Cross-links: [[ROUTES]] · [[features#Payment Links]] · [[SYSTEM/WORKFLOWS]]

---

## Executive summary

The system is **not one pipeline**. It is **five parallel implementations** plus legacy paths, glued by a read-only aggregator (`listPendingPaymentReviews` in `src/services/paymentProofQueue.ts`). Upload, rejection, notification, resident UX, and timeline behavior **diverge by payment type**.

| Area | Verdict |
|------|---------|
| Unified admin review panel | Partial — 5 kinds in one UI; PlayStation excluded |
| Unified data model | No — 5 tables, no shared proof-review entity |
| Rejection + re-upload | Broken — no persisted rejection state; stale queue artifacts |
| Deposit proofs reaching admin | High risk — missing notification sync + queue filters |
| Approval page crash | Likely — unguarded spreads/maps on optional fields |
| Timeline | Missing — no proof audit trail with reason/admin/timestamps |

---

## Upload endpoints

### Screenshot → blob

| Entry | File |
|-------|------|
| `uploadPaymentScreenshotAction` | `app/(admin)/admin/pgs/payment-actions.ts` |
| `uploadPaymentLinkScreenshotAction` | `app/(customer)/pay/actions.ts` |
| Core | `src/lib/payments/screenshotUpload.ts` → `resident_upload_events` (orphan until linked) |

### Proof URL → domain record

| Type | Submit | Service | DB |
|------|--------|---------|-----|
| Rent | `POST /api/rent-invoice/[id]/payment-proof` | `submitRentPaymentProof` | `rent_invoices` |
| Electricity | `POST /api/electricity-invoice/[id]/payment-proof` | `submitElectricityPaymentProof` | `electricity_invoices` |
| Deposit | `submitPaymentLinkProofAction` (deposit) | `submitDepositLinkPaymentProof` | `payment_links` |
| Booking | `POST /api/payment-record/booking` | `submitBookingPaymentRecord` | `pg_payment_records` + `bookings.pending_approval` |
| Extension | `POST /api/stay-extension/[id]/payment-proof` | `submitExtensionPaymentProof` | `stay_extensions` |
| Generic QR | `POST /api/payment-record` | `submitPaymentRecord` | `pg_payment_records` |

---

## Notifications

Flow: upload → (maybe) `scheduleAdminNotificationSync()` → `syncActionItemsForCron()` → `syncPaymentReviews()` → `action_items` (`payment_received`) → `admin_notifications` (`payment_proof_uploaded`).

| Upload calls `scheduleAdminNotificationSync` | Types |
|---------------------------------------------|-------|
| Yes | Rent, electricity, booking QR |
| No (cron only) | Deposit link, extension, generic QR |

Reject paths do **not** call `resolveStalePaymentReviewArtifacts` immediately.

---

## Queues

| Queue | File | SSOT? |
|-------|------|-------|
| Payment review | `paymentProofQueue.listPendingPaymentReviews` | Read SSOT |
| Unified operations | `unifiedOperationsQueue.loadUnifiedOperationsQueue` | Aggregator |
| Action items | `actionItems.syncPaymentReviews` | Mirror |
| Booking approval | `listPendingBookingApprovals` | Separate (`pending_approval`) |
| Orphan uploads | `resident_upload_events`, `/admin/uploads` | Diagnostic |

Queue keys: `rent-{id}`, `elec-{id}`, `deposit-link-{id}`, `ext-{id}`, `qr-{id}`.

Deposit queue requires `payment_links.booking_id IS NOT NULL`.

---

## Admin approve / reject

**Hub:** `app/(admin)/admin/payments/actions.ts`  
**UI:** `OperationsPaymentReviewsPanel` at `/admin/operations?filter=payment_proof`

| Type | Approve | Reject | Reason persisted? |
|------|---------|--------|-------------------|
| Rent | `approveRentProofAction` | `rejectRentProofAction` | Email only |
| Electricity | `approveElectricityProofAction` | `rejectElectricityProofAction` | Email only |
| Deposit | `approveDepositLinkProofAction` | `rejectDepositLinkProofAction` | No |
| Extension | `approveExtensionProofAction` | `rejectExtensionPaymentProof` | No |
| Booking | `approveQrPaymentAction` | `rejectQrPaymentAction` | Fixed audit string; cancels booking |

Legacy bypasses: `PATCH /api/payment-record/[id]`, `recordOfflinePaymentAction`, unused `PgPaymentsAdminPanel`.

---

## Deep links

Built: `/admin/operations?filter=payment_proof&key={paymentReviewKey}` (`actionDeepLinks.ts`).  
**Operations page does not read `key`, `focus`, or `booking` query params** — notifications cannot focus a specific card.

---

## Production issues — root causes

### 1. Rejected proofs keep returning

- Reject does not resolve stale `action_items` / notifications until next sync.
- No `rejected` status or `rejection_reason` on invoice/link tables.
- Resident UI: `ResidentPaymentConfirmFlow` treats `existingProofUrl` as terminal success; no “Upload again”.
- QR reject keeps screenshot on `pg_payment_records`; booking cancelled.

### 2. Deposit proofs disappear

- `submitDepositLinkPaymentProof` missing `scheduleAdminNotificationSync`.
- Queue excludes links without `booking_id`.
- Residents ops dashboard hides proofs during active checkout settlement.
- Orphan uploads: blob saved but submit never completed (`/admin/uploads`).

### 3. `undefined is not iterable`

Likely: `unifiedOperationsQueue.rowToFilterTags` (`[...row.filterTags]`), `OperationsMasterQueue` `outstandingLines.map` without optional chaining.

### 4. No timeline

No append-only proof events; KYC/checkout have `rejection_reason`, payment proofs do not.

---

## Target architecture (for implementation approval)

Introduce `payment_proof_submissions` + `payment_proof_review_events` as SSOT; adapters per entity type; reject creates new submission cycle; approve/reject always run stale cleanup and notification sync.

**Implementation order:** (1) notification sync + crash guards + stale cleanup on reject, (2) rejection contract + resident UI, (3) submission SSOT migration, (4) timeline UI, (5) remove legacy paths.

---

## File index

- `src/services/paymentProofQueue.ts`
- `src/services/unifiedOperationsQueue.ts`
- `src/services/actionItems.ts`
- `src/services/paymentReviewIntegrity.ts`
- `app/(admin)/admin/payments/actions.ts`
- `src/components/admin/operations/OperationsPaymentReviewsPanel.tsx`
- `src/services/residentUploadEvents.ts`
- Domain: `rentInvoices.ts`, `meterElectricity.ts`, `residentCharges.ts`, `qrPayments.ts`, `extension.ts`

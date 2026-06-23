# Booking Payment Verification

**Scope:** Booking checkout payment only (rent + deposit at new-booking time).  
**Out of scope:** Rent invoice proof, electricity proof, extension proof, deposit payment links — those are separate workflows.  
**Method:** Static code trace — no runtime E2E executed in this pass.  
**Date:** 13 June 2026  
**Sources:** [`SYSTEM_TRUTH_MAP.md`](../SYSTEM_TRUTH_MAP.md) §2 · [`MASTER_TEST_MATRIX.md`](../MASTER_TEST_MATRIX.md) §2  
**Canonical SSOT:** `recordPaymentSuccess()` in `src/services/bookingLifecycle.ts`

---

## Canonical flow (reference)

```mermaid
flowchart TB
  subgraph customer [Customer]
    PAY[/booking/code/pay]
    API[POST /api/payment-record/booking]
  end

  subgraph admin [Admin]
    REV[/admin/operations/payment-reviews]
    OFF[/admin/bookings/bookingId — Record offline]
  end

  subgraph canonical [Canonical]
    SUB[submitBookingPaymentRecord]
    REVIEW[reviewPaymentRecord approved]
    RPS[recordPaymentSuccess]
  end

  subgraph bypass [Bypass — NOT canonical]
    OFFACT[recordOfflinePaymentAction]
  end

  PAY --> API --> SUB
  SUB -->|pending_approval| REV
  REV --> REVIEW --> RPS

  OFF --> OFFACT
  OFFACT -.->|skips| RPS
```

**Payment split SSOT:** `splitBookingPayment()` / `validateBookingPayment()` in `src/services/depositCollection.ts`, fed by `breakdownBookingCheckoutPayment()` in `src/lib/billing/bookingCheckoutTotals.ts`.

**Allocation order:** Rent first → deposit cash due → remainder to prior outstanding (if snapshot has `priorOutstanding`).

---

## Path summary

| # | Path | Canonical? | Entry | Confirms booking? |
|---|------|------------|-------|-------------------|
| 1 | New booking payment proof (full approve) | Yes | Customer pay + admin approve | Yes |
| 2 | Offline admin payment | **No — bypass** | Admin booking detail | Yes (direct DB) |
| 3 | Partial payment | Yes (with flag) | Admin partial approve | Yes |
| 4 | Overpayment | Yes (validation only) | Admin approve overpaid proof | Yes |
| 5 | Deposit-only payment | **Rejected** on canonical path | — | No |
| 6 | Rent-only payment | **Rejected** (if deposit required) | — | No |
| 7 | Booking hold payment | Yes (pre-approve phase) | Customer proof while `hold` | No until approve |
| 8 | Payment rejection | Yes (cleanup) | Admin reject | No — cancelled |

---

## Shared impact matrix (canonical `recordPaymentSuccess`)

When this function runs successfully with `stateChanged: true`:

| Impact area | Behavior |
|-------------|----------|
| **Invoice creation** | None. Booking checkout does not create `rent_invoices` or `financial_invoices`. |
| **Revenue creation** | None for monthly rent KPIs. A `payments` row with `purpose: 'booking'` is recorded (checkout collection, not rent billing revenue). |
| **Deposit ledger** | `recordDepositCollected()` for `depositPaisePaid` portion; admin transfer credit via `applyDepositCreditToBooking()` if `adminTransferred`; prior deposit slices via `applyPriorOutstandingFromCheckoutPayment()`. |
| **Resident status** | `bookings.status → confirmed`. Resident hub unlocks (`isResidentDashboardUnlocked`). `customers.residency_status` is **not** updated here (only on admin assign). |
| **Occupancy** | Primary `bed_reservations`: `hold → active`, `holdExpiresAt → null`. GiST constraint enforced via `bookingActivationConflicts()` pre-check. |
| **Notifications** | `notifyBookingConfirmed()` + `notifyPaymentReceipt()` → `email_delivery_log` via `queueTenantNotification`. |
| **Audit log** | `audit_log`: `entity=booking`, `action=payment_succeeded`, `actorType=system`. Partial deposit adds `partial_deposit_approved` (admin actor). |

QR approve path **additionally** fires `emitPaymentReceivedAutomation()` (`payment_received` event) after `recordPaymentSuccess`.

---

## 1. New booking payment proof (full approve)

### Expected behavior

1. Customer on `/booking/[bookingCode]/pay` uploads UPI screenshot for **full checkout total** (rent + deposit cash due + prior outstanding per snapshot).
2. `pg_payment_records` row created (`status: pending`); booking → `pending_approval`; hold extended 7 days.
3. Admin approves at `/admin/operations/payment-reviews` → `approveQrPaymentAction`.
4. `recordPaymentSuccess()` validates full payment, inserts `payments`, confirms booking, mirrors deposit to ledger, sends emails.

### Actual behavior (code trace)

| Step | File | Function |
|------|------|----------|
| Customer submit | `app/api/payment-record/booking/route.ts` | `POST` → `submitBookingPaymentRecord()` |
| Proof insert | `src/services/qrPayments.ts` L229–328 | Insert `pg_payment_records`, extend `holdExpiresAt`, `markBookingAwaitingApproval()` |
| Admin approve | `app/(admin)/admin/payments/actions.ts` L37–47 | `approveQrPaymentAction` → `reviewPaymentRecord(..., 'approved')` |
| Lifecycle | `src/services/qrPayments.ts` L496–515 | `recordPaymentSuccess({ provider: 'upi_manual', providerPaymentId: 'qr_record_${recordId}', partialDeposit: undefined })` |
| Confirm | `src/services/bookingLifecycle.ts` L225–552 | Full canonical path |

### Impacts

| Area | Result |
|------|--------|
| Invoice creation | None |
| Revenue creation | `payments` row only (`purpose: 'booking'`) |
| Deposit ledger | `recordDepositCollected(depositPaisePaid)`; `applyFullDepositOnConfirm()` if deposit fully covered |
| Resident status | `confirmed`; dashboard unlocked |
| Occupancy | `hold → active` |
| Notifications | `booking_confirmed` + `payment_receipt` emails; `payment_received` automation |
| Audit log | `payment_succeeded` (system); `pg_payment_records.reviewedByAdminId` set |

### Tables touched

`pg_payment_records`, `bookings`, `bed_reservations`, `payments`, `deposit_ledger`, `audit_log`, `email_delivery_log` (async), `automation_events` (async)

### Status

**NOT TESTED** (E2E). Unit coverage on checkout totals only (`tests/unit/bookingCheckoutTotals.test.ts`).

---

## 2. Offline admin payment

### Expected behavior (product intent per comment)

Same end state as Razorpay capture: `payments` + confirmed booking + active reservation + deposit ledger + prior outstanding + partial deposit handling.

### Actual behavior — **BYPASSES CANONICAL FLOW**

| Step | File | Function |
|------|------|----------|
| Entry | `/admin/bookings/[bookingId]` | `AdminBookingActions` → `recordOfflinePaymentAction` |
| Action | `app/(admin)/admin/bookings/[bookingId]/actions.ts` L88–223 | Direct transaction |

**Code path (no `recordPaymentSuccess`):**

```
recordOfflinePaymentAction
  → assertAdminBookingCodeAccess
  → validate status ∈ {pending_payment, draft, confirmed}
  → validate amount === bookings.totalPaise (or payments:override + reason)
  → INSERT payments (purpose: 'booking', status: 'succeeded')
  → UPDATE bed_reservations SET active WHERE status='hold' AND kind='primary'
  → UPDATE bookings SET confirmed
  → INSERT audit_log (action: 'record_offline_payment', entity: 'payment')
```

### Impacts

| Area | Expected (canonical) | Actual (offline) | Gap |
|------|---------------------|------------------|-----|
| Invoice creation | None | None | — |
| Revenue creation | `payments` row | `payments` row | — |
| Deposit ledger | `recordDepositCollected` | **Skipped** | **BROKEN** |
| Prior outstanding | `applyPriorOutstandingFromCheckoutPayment` | **Skipped** | **BROKEN** |
| Partial deposit status | `applyPartialDepositOnConfirm` / `applyFullDepositOnConfirm` | **Skipped** | **BROKEN** |
| Admin deposit transfer credit | `applyDepositCreditToBooking` | **Skipped** | **BROKEN** |
| PS4 membership | `activatePendingMembershipForBooking` | **Skipped** | **BROKEN** |
| Resident status | `confirmed` | `confirmed` | OK |
| Occupancy | `hold → active` | `hold → active` | OK (no conflict pre-check) |
| Notifications | Emails on confirm | **None** | **BROKEN** |
| Audit log | `payment_succeeded` on booking | `record_offline_payment` on payment only | Different shape |

### Additional gaps

- No `bookingActivationConflicts()` check before activation (race with another approved payment possible).
- Allows recording on `confirmed` booking (additional payment row without lifecycle).
- Amount compared to `bookings.totalPaise` (includes prior outstanding + PS4 at create) but does not allocate split.

### Tables touched

`payments`, `bookings`, `bed_reservations`, `audit_log` only

### Status

**FAIL** — documented bypass; must fix or disable before closing Booking Payment workflow.

---

## 3. Partial payment

### Expected behavior

Customer pays **full rent + partial deposit** (deposit remainder due later). Admin uses **Partial approve** with a future `depositDueDate`. Booking confirms; deposit collection status = `partial`; deposit-due payment link created.

### Actual behavior

| Step | File | Function |
|------|------|----------|
| Submit | Same as path 1 | Amount < `bookingTotalDuePaise` but ≥ rent + some deposit |
| Queue UI | `src/services/paymentProofQueue.ts` L137–146 | `canPartialApprove = !isFullPayment && depositPaisePaid > 0` |
| Admin action | `app/(admin)/admin/payments/actions.ts` L50–74 | `approvePartialQrPaymentAction(recordId, pgId, depositDueDate)` |
| Review | `src/services/qrPayments.ts` L509–514 | `recordPaymentSuccess({ partialDeposit: { depositDueDate, approvedByAdminId } })` |
| Validation | `src/services/depositCollection.ts` L113–138 | `allowPartialDeposit: true` — requires full rent + `depositPaisePaid > 0` |
| Post-confirm | `src/services/depositCollection.ts` L220–249 | `applyPartialDepositOnConfirm()` → `depositCollectionStatus: 'partial'`, audit, `ensureDepositDuePaymentLink()` |

### Impacts

| Area | Result |
|------|--------|
| Invoice creation | None at checkout; deposit-due may create `payment_links` (not `financial_invoices` until link flow) |
| Revenue creation | `payments` for amount submitted |
| Deposit ledger | `recordDepositCollected(depositPaisePaid)` — partial amount only |
| Resident status | `confirmed` (move-in allowed with partial deposit policy) |
| Occupancy | `hold → active` |
| Notifications | Same as full approve (`notifyBookingConfirmed`, `notifyPaymentReceipt`) |
| Audit log | `payment_succeeded` + `partial_deposit_approved` (admin actor, deposit due date) |

### Validation failures (partial path not available)

- Rent short: `"Rent (₹X) must be paid in full before partial deposit move-in."`
- Zero deposit paid now: `"Partial deposit approval requires at least some deposit paid now."`
- Short overall without partial flag: `"Payment is short by ₹X. Full checkout total is required unless admin approves partial deposit."`

### Status

**NOT TESTED** (E2E). Logic trace **VERIFIED**.

---

## 4. Overpayment

### Expected behavior (UI)

Admin review panel shows `overpaidPaise = received − expectedTotal`. Operator selects disposition: `wallet_credit` | `future_adjustment` | `refund_later`. Payment confirms; excess handled per disposition.

### Actual behavior

| Step | File | Behavior |
|------|------|----------|
| Display | `src/services/paymentProofQueue.ts` L138 | `overpaidPaise = max(0, receivedPaise - expectedTotalPaise)` |
| UI | `OperationsPaymentReviewsPanel.tsx` L100–111 | Requires disposition when `overpaidPaise > 0` |
| Stored | `src/services/qrPayments.ts` L503–507 | `rawPayload.operationsReview.overpaymentDisposition` — **metadata only** |
| Validation | `src/services/depositCollection.ts` L109–110 | `isFullPayment` true when `payment >= bookingTotalDuePaise` — **overpay passes** |
| Allocation | `src/services/bookingLifecycle.ts` L467–483 | Excess after rent+deposit → `applyPriorOutstandingFromCheckoutPayment()` if prior balance exists |
| No prior outstanding | — | **Excess not allocated** — full amount in `payments.amountPaise`, no wallet credit implementation |

### Impacts

| Area | Result |
|------|--------|
| Invoice creation | None |
| Revenue creation | `payments.amountPaise` = **full submitted amount** (including unallocated excess) |
| Deposit ledger | Capped at `depositCashDuePaise` — excess does not increase ledger |
| Resident status | `confirmed` |
| Occupancy | `hold → active` |
| Notifications | Standard confirm + receipt (uses full `input.amountPaise`) |
| Audit log | `payment_succeeded`; disposition in `payments.rawPayload` only — **no ledger/wallet action** |

### Gap

**Overpayment disposition is UI + audit metadata only.** No code path implements `wallet_credit`, `future_adjustment`, or `refund_later` after approve.

### Status

**FAIL** (disposition not enforced in backend) / **NOT TESTED** (E2E)

---

## 5. Deposit-only payment

### Expected behavior

Customer pays only the deposit portion without rent — should not confirm booking (rent is mandatory at checkout).

### Actual behavior

| Condition | Result |
|-----------|--------|
| `allowPartialDeposit: false` (default approve) | `validateBookingPayment` fails: payment short of `bookingTotalDuePaise` → `recordPaymentSuccess` returns `{ ok: false }` → admin approve throws |
| `allowPartialDeposit: true` (partial approve) | Fails: `"Rent (₹X) must be paid in full before partial deposit move-in."` (`depositCollection.ts` L124–128) |
| `depositPaise === 0` on booking | Degenerate case: entire checkout is rent-only; “deposit-only” N/A |
| Offline admin | Can confirm if `amountPaise === bookings.totalPaise` — if total happens to equal deposit-only quote (unlikely; total always includes rent) |

### Impacts if attempted via canonical path

None — booking does not confirm.

### Status

**VERIFIED** (rejected by validation). No separate deposit-only booking payment entry point.

---

## 6. Rent-only payment

### Expected behavior

Customer pays only rent portion, zero deposit — should not confirm when deposit is required.

### Actual behavior

| Condition | Result |
|-----------|--------|
| Canonical full approve | Fails validation: payment short unless `depositPaise === 0` |
| Partial approve | Fails: `"Partial deposit approval requires at least some deposit paid now."` |
| Zero-deposit booking | Paying `rentDuePaise` equals full checkout → **passes** as full payment (deposit ledger skipped when `depositPaise === 0`, `bookingLifecycle.ts` L252) |

### Split logic (why rent-only fails when deposit required)

`splitBookingPayment()` (`depositCollection.ts` L68–71):

```
rentPaisePaid = min(payment, rentDuePaise)
depositPaisePaid = min(payment - rentPaisePaid, depositCashDuePaise)
```

Rent-only payment leaves `depositPaisePaid === 0` → partial path rejected; full path rejected if `payment < bookingTotalDuePaise`.

### Impacts

No confirm unless zero-deposit booking and payment covers rent.

### Status

**VERIFIED** (rejected when deposit required). **NOT TESTED** zero-deposit E2E.

---

## 7. Booking hold payment

Covers payment **while reservation is on hold** (before admin approval) — the pre-confirm phase.

### Expected behavior

1. After `createBooking` (customer): `bookings.status = pending_payment`, `bed_reservations.status = hold`.
2. Customer submits proof → booking moves to `pending_approval`, hold extended (not yet active).
3. Admin approves → `active` + `confirmed`.
4. If hold expires before approval → cron cancels (`releaseExpiredHolds`).

### Actual behavior — submit phase

| Step | File | Behavior |
|------|------|----------|
| Create hold | `src/services/booking.ts` | `hold` reservation + `holdExpiresAt` |
| Submit proof | `src/services/qrPayments.ts` L296–320 | `holdExpiresAt = now + 7 days`; `markBookingAwaitingApproval()` |
| Booking status | `src/lib/bookingApproval.ts` L75–81 | `pending_payment → pending_approval` |
| Reservation | Unchanged | Still `hold` until `recordPaymentSuccess` |

### Actual behavior — approve phase

Same as path 1 (`recordPaymentSuccess` flips hold → active).

### Impacts during hold phase (after submit, before approve)

| Area | Result |
|------|--------|
| Invoice creation | None |
| Revenue creation | None |
| Deposit ledger | None |
| Resident status | `pending_approval`; dashboard **locked** (`isResidentDashboardUnlocked` requires `confirmed`) |
| Occupancy | `hold` — bed blocked for this booking; hold timer extended |
| Notifications | None on submit |
| Audit log | None on submit; `visitorAnalytics` `payment_uploaded` event |

### Hold expiry (no payment / rejected)

Cron `releaseExpiredHolds()` — cancels booking and hold (separate from path 8 rejection).

### Status

**NOT TESTED** (E2E timing). Code trace **VERIFIED**.

---

## 8. Payment rejection

### Expected behavior

Admin rejects UPI proof → booking cancelled, hold released, no payment/deposit/invoice artefacts.

### Actual behavior

| Step | File | Function |
|------|------|----------|
| Admin action | `app/(admin)/admin/payments/actions.ts` L77–81 | `rejectQrPaymentAction` → `reviewPaymentRecord(..., 'rejected')` |
| Cleanup | `src/lib/bookingApproval.ts` L87–133 | `cleanupRejectedBookingRequest()` |
| Record update | `src/services/qrPayments.ts` L535–543 | `pg_payment_records.status = rejected` |

**`cleanupRejectedBookingRequest` transaction:**

```
bed_reservations (hold|active, primary) → cancelled
bookings (pending_payment|pending_approval) → cancelled + cancellationReason
rent_invoices (pending|overdue|payment_in_progress) → cancelled (defensive)
```

Does **not** call `recordPaymentSuccess`. No `payments` row created.

### Impacts

| Area | Result |
|------|--------|
| Invoice creation | None created; defensive cancel of any premature rent invoices |
| Revenue creation | None |
| Deposit ledger | None |
| Resident status | `cancelled`; dashboard remains locked |
| Occupancy | Reservation `cancelled` — bed released |
| Notifications | **None** (no rejection email in code) |
| Audit log | **None** on booking/payment entity — only `pg_payment_records.reviewedByAdminId` |

### Status

**NOT TESTED** (E2E). Cleanup logic trace **VERIFIED**.

---

## Alternate canonical entry points (same `recordPaymentSuccess`)

Not in the 8-path list but share the canonical lifecycle when used for booking checkout:

| Entry | File | Notes |
|-------|------|-------|
| Razorpay webhook | `/api/webhooks/razorpay` | `recordPaymentSuccess({ provider: 'razorpay' })` |
| Razorpay verify | `/api/payments/razorpay/verify` | `verifyRazorpayCheckoutPayment()` |
| Mock webhook | `/api/webhooks/mock` | Dev/test |
| E2E scripts | `scripts/verify-*.ts` | Direct `recordPaymentSuccess` calls |

Customer booking pay page (`BookingCheckoutExperience`) is **QR proof only** — Razorpay UI not wired despite infrastructure existing (`RAZORPAY_E2E_REPORT.md`).

---

## Bypass registry

| Path | Bypasses `recordPaymentSuccess` | Severity |
|------|-----------------------------------|----------|
| Offline admin payment (`recordOfflinePaymentAction`) | **Yes** | Critical |
| Payment rejection | Intentionally bypasses (cleanup only) | OK |
| Submit proof (hold phase) | Intentionally bypasses (awaiting review) | OK |

---

## Financial consistency risks (booking payment only)

| ID | Risk | Paths affected |
|----|------|----------------|
| BP-F1 | Offline confirm without deposit ledger | Path 2 |
| BP-F2 | Offline confirm without prior outstanding allocation | Path 2 |
| BP-F3 | Overpayment disposition not applied to ledger/wallet | Path 4 |
| BP-F4 | `recordPaymentSuccess` swallows deposit ledger errors (`catch` L485–489) — booking still confirmed | Paths 1, 3, 4, 7 |
| BP-F5 | Offline skips `bookingActivationConflicts()` | Path 2 |
| BP-F6 | `payments.amountPaise` may exceed allocated rent+deposit+prior (overpay) | Path 4 |
| BP-F7 | Partial deposit confirms booking but deposit due tracked separately — ledger must match `depositDuePaise` | Path 3 |

---

## Test matrix cross-reference

| Matrix ID | Path | Status |
|-----------|------|--------|
| BP-01 | Path 1 submit | NOT TESTED |
| BP-02 | Path 1 approve | NOT TESTED |
| BP-03 | Path 2 offline | **FAIL** |
| BP-04 | Razorpay webhook | NOT TESTED |
| BP-05 | Razorpay customer UI | NOT TESTED |
| BP-06 | Path 3 partial | NOT TESTED |
| BP-07 | Prior outstanding (path 1/4) | NOT TESTED |
| BP-08 | Admin deposit transfer at checkout | NOT TESTED |

---

## Close criteria for Booking Payment workflow

1. **Path 2:** Route offline recording through `recordPaymentSuccess` OR disable UI until fixed.
2. **Path 4:** Implement overpayment disposition backend OR block approve when overpaid.
3. **BP-F4:** Decide fail-closed vs fail-open on deposit ledger errors.
4. Run E2E on staging: paths 1, 3, 7, 8 (happy + reject).
5. Run `scripts/verify-deposit-ledger.ts` after QR approve.
6. Update [`MASTER_TEST_MATRIX.md`](../MASTER_TEST_MATRIX.md) §2 statuses.

---

*Audit only — no code changes in this document.*

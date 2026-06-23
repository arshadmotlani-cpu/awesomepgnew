# Booking Payment Fix Report

**Date:** 13 June 2026  
**Scope:** BP-02 (offline bypass), BP-04 (overpayment disposition), BP-08 (rejection audit + notification)  
**Reference:** [`BOOKING_PAYMENT_VERIFICATION.md`](./BOOKING_PAYMENT_VERIFICATION.md)

---

## Summary

All three blockers from the verification audit have been addressed. Booking checkout payments now converge on `recordPaymentSuccess()` with shared downstream effects. Overpayment dispositions create traceable financial records. Payment proof rejection writes audit log and notifies the resident.

---

## 1. BP-02 — Offline admin payment

### Before

`recordOfflinePaymentAction` (`app/(admin)/admin/bookings/[bookingId]/actions.ts`) wrote `payments` and flipped `bookings` / `bed_reservations` directly.

**Skipped side effects:**

| Side effect | Skipped |
|-------------|---------|
| `recordPaymentSuccess()` validation + conflict check | Yes |
| Deposit ledger mirror | Yes |
| Prior outstanding allocation | Yes |
| Partial / full deposit collection status | Yes |
| Admin deposit transfer credit | Yes |
| PS4 membership activation | Yes |
| `notifyBookingConfirmed` / `notifyPaymentReceipt` | Yes |
| `payment_succeeded` audit on booking entity | Yes (had separate `record_offline_payment` on payment only) |
| `emitPaymentReceivedAutomation` | Yes |

### After

Offline recording calls `recordPaymentSuccess()` with:

- Same providers: `cash`, `upi_manual`, `bank_transfer`
- Stable idempotent `providerPaymentId`: `offline_{reference}` or `offline_{uuid}`
- `recordedByAdminId` for audit attribution
- `rawPayload.adminAmountOverrideReason` when super-admin overrides amount

**Now runs:** deposit ledger, prior outstanding, partial deposit, notifications, conflict checks, automation — identical to QR approve path.

### Code paths changed

| File | Change |
|------|--------|
| `app/(admin)/admin/bookings/[bookingId]/actions.ts` | Replaced direct DB transaction with `recordPaymentSuccess()` |
| `src/services/bookingLifecycle.ts` | Added `recordedByAdminId`, `wasAwaitingConfirm` gating, moved `emitPaymentReceivedAutomation` here |

---

## 2. BP-04 — Overpayment disposition

### Before

`overpaymentDisposition` stored in `payments.rawPayload.operationsReview` only. Excess paise remained unallocated except when prior outstanding absorbed it.

### After

New service: `src/services/bookingOverpayment.ts`

| Disposition | Financial record | Ledger | Invoice | Revenue | Resident-visible |
|-------------|------------------|--------|---------|---------|------------------|
| **wallet_credit** | `deposit_ledger` collected entry + `audit_log` `booking_overpayment_wallet_credit` | +excess on booking wallet | None | Liability ↑ (deposit wallet) | Email `overpayment_wallet_credit`; wallet balance ↑ |
| **refund** / **refund_later** | `pricing_snapshot.checkoutCredits[]` kind `refund_pending` + `audit_log` `booking_overpayment_refund_pending` | None (no false wallet credit) | None | None until operator refunds | Email `overpayment_refund_pending` |
| **future_adjustment** | `pricing_snapshot.checkoutCredits[]` kind `future_rent_adjustment` + `audit_log` `booking_overpayment_future_adjustment` | None | Credit stored for future rent (not auto-applied yet) | None until rent invoice consumes credit | Email `overpayment_future_credit` |

**Enforcement:** QR approve throws if `overpaidPaise > 0` and no disposition selected (`qrPayments.ts`).

**Computation:** `computeBookingCheckoutOverpaymentPaise()` — excess after rent + deposit + prior-outstanding slices.

### Code paths changed

| File | Change |
|------|--------|
| `src/services/bookingOverpayment.ts` | **New** — compute excess, apply disposition |
| `src/lib/billing/bookingOverpaymentConstants.ts` | **New** — ledger reason prefixes |
| `src/services/bookingLifecycle.ts` | Accept `overpayment` input; call disposition after allocation |
| `src/services/qrPayments.ts` | Compute excess, require disposition, pass to lifecycle |
| `src/db/schema/bookings.ts` | `PricingSnapshot.checkoutCredits` type |
| `src/lib/email/notifications.ts` | Overpayment + rejection notification helpers |

---

## 3. BP-08 — Payment rejection

### Before

`cleanupRejectedBookingRequest()` cancelled booking/reservation but:

- No `audit_log` entry
- No resident email

### After

On reject (`reviewPaymentRecord` → `cleanupRejectedBookingRequest`):

| Effect | Detail |
|--------|--------|
| Audit log | `entity=booking`, `action=payment_proof_rejected`, admin actor |
| Notification | `notifyPaymentProofRejected()` → `email_delivery_log` kind `payment_proof_rejected` |
| Existing cleanup | Reservation cancelled, booking cancelled, defensive rent invoice cancel |

### Code paths changed

| File | Change |
|------|--------|
| `src/lib/bookingApproval.ts` | Extended cleanup with audit + notification |
| `src/services/qrPayments.ts` | Pass admin/customer/booking context on reject |
| `src/lib/email/notifications.ts` | `notifyPaymentProofRejected()` |

---

## Test coverage

| Test | File | Status |
|------|------|--------|
| Overpayment computation + disposition normalize | `tests/unit/bookingOverpayment.test.ts` | **PASS** |
| Booking approval phase helpers | `tests/unit/bookingApproval.test.ts` | **PASS** |
| Checkout totals SSOT | `tests/unit/bookingCheckoutTotals.test.ts` | **PASS** |
| Production build | `npm run build` | **PASS** |
| Offline E2E / DB integration | — | **NOT TESTED** |
| Overpayment disposition E2E | — | **NOT TESTED** |
| Rejection email delivery | — | **NOT TESTED** |

---

## Remaining risks

| ID | Risk | Notes |
|----|------|-------|
| R1 | Deposit ledger errors swallowed | `recordPaymentSuccess` still catches deposit mirror errors and continues (BP-F4). Not changed in this phase. |
| R2 | Offline super-admin underpay override | Amount below checkout total without partial-deposit approval still fails `validateBookingPayment`. Use payment-reviews partial approve instead. |
| R3 | `checkoutCredits` not auto-applied to rent invoices | Future adjustment and refund_pending stored on snapshot; rent generation does not consume credits yet — operator must apply manually until Rent Billing workflow closed. |
| R4 | Refund disposition is queued | Operator must process actual UPI/bank refund outside system; snapshot + audit is the trace record. |
| R5 | Additional payment on already-confirmed booking | Gated: deposit mirror and confirm notifications only run when `wasAwaitingConfirm` — additional offline payment on confirmed booking records payment + receipt only. |

---

## Verification checklist (staging)

- [ ] Offline payment on `pending_payment` booking → deposit ledger matches QR path
- [ ] QR approve with overpay + wallet_credit → ledger entry + email
- [ ] QR approve with overpay + future_adjustment → snapshot credit + email
- [ ] QR approve with overpay + refund_later → snapshot refund_pending + email
- [ ] QR reject → audit row + rejection email + booking cancelled
- [ ] Idempotent replay of same offline reference → no duplicate state change

---

*Booking Payment workflow may be marked closed after staging verification of the checklist above.*

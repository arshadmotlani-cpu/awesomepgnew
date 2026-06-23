# Awesome PG — Master Test Matrix

**Purpose:** One workflow at a time verification checklist. Close each topic permanently before moving to the next.  
**Verification order (recommended):** Booking → Payments → Deposits → Revenue → KYC → Vacating  
**Date:** 13 June 2026  
**Method:** Status reflects **automated test + static audit** at time of writing. Full E2E on staging DB not yet executed in this pass.  
**Companions:** [`SYSTEM_TRUTH_MAP.md`](./SYSTEM_TRUTH_MAP.md) · [`SYSTEM_GRAPH.md`](./SYSTEM_GRAPH.md)

---

## Status legend

| Status | Meaning |
|--------|---------|
| **PASS** | Unit tests or verify scripts cover core logic; no known code defect on canonical path |
| **FAIL** | Known broken or inconsistent path in code audit |
| **NOT TESTED** | No automated integration/E2E; requires manual staging verification |

---

## Summary dashboard

| # | Workflow | Status | Blocker |
|---|----------|--------|---------|
| 1 | Booking | NOT TESTED | No DB integration test for concurrent holds |
| 2 | Booking Payment | **FAIL** | `recordOfflinePaymentAction` bypass |
| 3 | Payment Proof Approval | NOT TESTED | Multi-kind queue E2E |
| 4 | Revenue | NOT TESTED | Cron batch E2E |
| 5 | Invoices | NOT TESTED | Unified sync reconciliation |
| 6 | Deposits | PASS | Unit tests on ledger SSOT |
| 7 | Deposit Transfers | NOT TESTED | Admin transfer E2E |
| 8 | Rent Billing | PASS | Unit tests; sync E2E missing |
| 9 | Electricity Billing | NOT TESTED | Multi-occupant split E2E |
| 10 | KYC | PASS | Unit tests on validation |
| 11 | Bed Assignment | NOT TESTED | GiST concurrency |
| 12 | Resident Lifecycle | NOT TESTED | Full journey E2E |
| 13 | Requests | NOT TESTED | Legacy vs checkout dedup |
| 14 | Vacating | NOT TESTED | Notice penalty edge cases |
| 15 | Checkout Settlement | PASS | Unit tests on deductions |
| 16 | Refunds | NOT TESTED | Path selection E2E |
| 17 | Wallet | NOT TESTED | Display vs ledger parity |
| 18 | Notifications | NOT TESTED | Email delivery in prod |

---

## 1. Booking

**STATUS:** NOT TESTED

| ID | Test case | Expected behavior | Actual behavior (audit) | Screens | Services | Tables |
|----|-----------|-------------------|---------------------------|---------|----------|--------|
| B-01 | Customer creates booking | `pending_payment`, `hold` reservation, hold expiry set | Code path verified in `createBooking()` | `/booking/new`, `/booking/[code]/pay` | `booking.ts`, `pricing.ts`, `availability.ts` | `bookings`, `bed_reservations` |
| B-02 | Admin assigns tenant | `confirmed`, `active`, `residency_status=active` | Verified in `assignTenantToBed()` | `/admin/bookings/new`, `/admin/pgs/[pgId]/map` | `tenantAssignment.ts` | `bookings`, `bed_reservations`, `customers` |
| B-03 | Hold expiry cron | Cancelled booking, bed released | `releaseExpiredHolds()` exists | — | `bookingLifecycle.ts` | `bookings`, `bed_reservations` |
| B-04 | Overlapping bed double-book | Second create fails GiST / availability | Pre-check + DB constraint | `/booking/new` | `availability.ts` | `bed_reservations` |
| B-05 | No auto deposit credit on create | Prior deposit not applied to new booking totals | Removed in deposit isolation fix | `/booking/new` | `bookingCheckoutTotals.ts` | `bookings.pricing_snapshot` |
| B-06 | Customer cancel pending | Booking cancelled, hold released | `cancelBooking()` | `/booking/[code]` | `bookingLifecycle.ts` | `bookings`, `bed_reservations` |

**Close criteria:** B-04 concurrency test on staging; B-01→B-06 manual E2E once.

---

## 2. Booking Payment

**STATUS:** FAIL

| ID | Test case | Expected behavior | Actual behavior (audit) | Screens | Services | Tables |
|----|-----------|-------------------|---------------------------|---------|----------|--------|
| BP-01 | QR proof submit | `pending_approval`, hold extended | Verified | `/booking/[code]/pay` | `qrPayments.ts` | `pg_payment_records`, `bookings` |
| BP-02 | Admin approve QR | `recordPaymentSuccess`, deposit ledger, active reservation | Canonical path verified | `/admin/operations/payment-reviews` | `bookingLifecycle.ts`, `deposits.ts` | `payments`, `deposit_ledger`, `bookings` |
| BP-03 | Admin offline payment | Same as BP-02 | **FAIL:** direct DB writes, skips lifecycle | `/admin/bookings/[bookingId]` | `recordOfflinePaymentAction` | `payments`, `bookings` — **no deposit_ledger** |
| BP-04 | Razorpay webhook | `recordPaymentSuccess` idempotent | Webhook code exists | — | `paymentVerification.ts` | `payments` |
| BP-05 | Customer Razorpay UI | Pay via Razorpay on booking page | **NOT TESTED:** UI is QR-only | `/booking/[code]/pay` | — | — |
| BP-06 | Partial deposit approve | Partial ledger + gating | Path exists | payment-reviews | `depositCollection.ts` | `deposit_ledger` |
| BP-07 | Prior outstanding allocation | Applied on confirm | Only via `recordPaymentSuccess` | payment-reviews | `bookingPriorOutstanding.ts` | `payments` |
| BP-08 | Admin deposit transfer at checkout | Credit if `adminTransferred` | Gated in totals + lifecycle | `/admin/deposits/[bookingId]` | `depositCredit.ts` | `deposit_ledger`, snapshot |

**Blocker:** BP-03 must be fixed or disabled before closing this workflow.

---

## 3. Payment Proof Approval

**STATUS:** NOT TESTED

| ID | Test case | Expected behavior | Actual behavior (audit) | Screens | Services | Tables |
|----|-----------|-------------------|---------------------------|---------|----------|--------|
| PP-01 | Queue lists all pending kinds | Booking, rent, elec, extension, deposit link | `listPendingPaymentReviews()` | `/admin/operations/payment-reviews` | `paymentProofQueue.ts` | multiple |
| PP-02 | Approve rent proof | Invoice paid, unified sync | Verified chain | payment-reviews | `rentInvoices.ts` | `rent_invoices`, `financial_invoices` |
| PP-03 | Approve elec proof | Invoice paid | Verified chain | payment-reviews | `electricityBilling.ts` | `electricity_invoices` |
| PP-04 | Reject booking proof | Booking cancelled | `cleanupRejectedBookingRequest()` | payment-reviews | `qrPayments.ts` | `bookings` |
| PP-05 | Prior deposit info on card | Informational only, no auto-apply | Post isolation fix | payment-reviews | `paymentProofQueue.ts` | read-only |
| PP-06 | `/admin/payments` redirect | Lands on payment-reviews | Redirect verified | `/admin/payments` | — | — |

---

## 4. Revenue

**STATUS:** NOT TESTED

| ID | Test case | Expected behavior | Actual behavior (audit) | Screens | Services | Tables |
|----|-----------|-------------------|---------------------------|---------|----------|--------|
| RV-01 | Cron generate monthly rent | Invoices for eligible bookings | Cron route exists | — | `generateRentInvoicesForMonth()` | `rent_invoices` |
| RV-02 | Admin manual generate | Same as cron | Action exists | `/admin/revenue/billing` | `rentInvoices.ts` | `rent_invoices` |
| RV-03 | Revenue KPIs match invoices | Outstanding = sum pending rent | Read from command center | `/admin/revenue` | `revenueCommandCenter.ts` | `rent_invoices`, `financial_invoices` |
| RV-04 | Pro-rate first/last month | Correct amounts | Unit tests partial | — | `billing.ts` | `rent_invoices` |
| RV-05 | Ineligible booking skipped | No invoice for daily/hold/cancelled | Eligibility in generator | — | `rentInvoices.ts` | — |

---

## 5. Invoices

**STATUS:** NOT TESTED

| ID | Test case | Expected behavior | Actual behavior (audit) | Screens | Services | Tables |
|----|-----------|-------------------|---------------------------|---------|----------|--------|
| INV-01 | Rent sync to unified | `financial_invoices` row matches rent | Async sync | `/admin/invoices` | `unifiedInvoices.ts` | `financial_invoices` |
| INV-02 | Shared link works | Resident sees document | Route exists | `/resident/invoices/[ref]` | `invoiceDocumentModel.ts` | `financial_invoices` |
| INV-03 | Admin refund | Status refunded, allocation reversed | Verified | `/admin/invoices/[id]` | `refundUnifiedInvoice()` | `financial_invoices` |
| INV-04 | Hub nav to invoice | Link from resident hub | **FAIL nav:** H10 — no hub link | resident hub | — | — |
| INV-05 | Combined invoice | Single financial_invoices combined type | `invoiceGeneration.ts` | admin invoices | `invoiceGeneration.ts` | `financial_invoices` |

---

## 6. Deposits

**STATUS:** PASS

| ID | Test case | Expected behavior | Actual behavior (audit) | Screens | Services | Tables |
|----|-----------|-------------------|---------------------------|---------|----------|--------|
| D-01 | Ledger on booking confirm | `collected` entry | Via `recordDepositCollected` | — | `deposits.ts` | `deposit_ledger` |
| D-02 | Balance formula | collected − deducted − refunded | Unit tested | `/admin/deposits/[bookingId]` | `deposits.ts` | `deposit_ledger` |
| D-03 | Admin add deposit | New collected entry | Action exists | deposit detail | `deposits.ts` | `deposit_ledger` |
| D-04 | Admin deduct | Deduction entry | Action exists | deposit detail | `depositSettlement.ts` | `deposit_ledger` |
| D-05 | Deposit due link pay | Proof → ledger | Deposit link flow | `/pay/[linkId]` | `depositCollection.ts` | `payment_links`, `deposit_ledger` |
| D-06 | Partial collection status | Gates move-in | `deposit_collection_status` | resident hub | `depositCollection.ts` | `bookings` |

---

## 7. Deposit Transfers

**STATUS:** NOT TESTED

| ID | Test case | Expected behavior | Actual behavior (audit) | Screens | Services | Tables |
|----|-----------|-------------------|---------------------------|---------|----------|--------|
| DT-01 | Admin transfer old → new | Source deducted, target collected, snapshot stamped | Code verified | `/admin/deposits/[bookingId]` | `transferOldDepositAdmin()` | `deposit_ledger`, snapshot |
| DT-02 | Customer cannot auto-transfer | No credit without admin | Verified removed | `/booking/new` | `booking.ts` | — |
| DT-03 | Checkout uses transferred credit | Lower pay amount | `adminTransferred` gate | `/booking/[code]/pay` | `bookingCheckoutTotals.ts` | snapshot |
| DT-04 | Audit log on transfer | Admin action logged | In service | admin deposits | `depositCredit.ts` | `audit_log` |

---

## 8. Rent Billing

**STATUS:** PASS (unit) / NOT TESTED (E2E)

| ID | Test case | Expected behavior | Actual behavior (audit) | Screens | Services | Tables |
|----|-----------|-------------------|---------------------------|---------|----------|--------|
| RB-01 | Generate for month | One invoice per booking per month | UNIQUE constraint | `/admin/rent` | `rentInvoices.ts` | `rent_invoices` |
| RB-02 | Pay via proof | Paid + receipt email | Chain verified | `/account/resident/pay-rent/[id]` | `rentInvoices.ts` | `rent_invoices`, `payments` |
| RB-03 | Pay via Razorpay | Webhook confirms | Code exists | pay-rent page | `recordRentPaymentSuccess` | `rent_invoices` |
| RB-04 | Late fee | Applied after due | Unit tests | — | `billing.ts` | `rent_invoices` |
| RB-05 | Cancel on vacating | Future invoices cancelled | On finalize | — | `vacating.ts` | `rent_invoices` |

---

## 9. Electricity Billing

**STATUS:** NOT TESTED

| ID | Test case | Expected behavior | Actual behavior (audit) | Screens | Services | Tables |
|----|-----------|-------------------|---------------------------|---------|----------|--------|
| EB-01 | Admin create bill | Per-occupant invoices | Verified | `/admin/electricity/new` | `electricityBilling.ts` | `electricity_bills`, `electricity_invoices` |
| EB-02 | Split among occupants | Sum equals bill total | Logic in billing | — | `splitElectricity()` | `electricity_invoices` |
| EB-03 | Pay via proof | Paid status | Chain exists | pay-electricity page | `meterElectricity.ts` | `electricity_invoices` |
| EB-04 | Prepaid credit | Room credit applied | Schema exists | — | `electricityBilling.ts` | `room_electricity_prepaid_ledger` |
| EB-05 | Redirect route | Collections tab | Redirect | `/admin/electricity` | — | — |

---

## 10. KYC

**STATUS:** PASS

| ID | Test case | Expected behavior | Actual behavior (audit) | Screens | Services | Tables |
|----|-----------|-------------------|---------------------------|---------|----------|--------|
| K-01 | Customer submit | Pending submission | Verified | `/account/profile?section=identity` | `kyc.ts` | `kyc_submissions` |
| K-02 | Admin approve | `kyc_status=approved` | Verified | `/admin/residents/kyc/[id]` | `kyc.ts` | `customers`, `kyc_submissions` |
| K-03 | Block assign without KYC | Assign fails | Verified | `/admin/bookings/new` | `tenantAssignment.ts` | — |
| K-04 | Image validation | Reject invalid uploads | Unit tested | identity section | `kycValidation.ts` | — |

---

## 11. Bed Assignment

**STATUS:** NOT TESTED

| ID | Test case | Expected behavior | Actual behavior (audit) | Screens | Services | Tables |
|----|-----------|-------------------|---------------------------|---------|----------|--------|
| BA-01 | Map assign | Active reservation | Verified | `/admin/pgs/[pgId]/map` | `tenantAssignment.ts` | `bed_reservations` |
| BA-02 | Reassign tenant | Old completed, new active | `updateTenancyAction` | resident admin | `tenantAssignment.ts` | `bed_reservations` |
| BA-03 | GiST overlap reject | DB error on conflict | Constraint exists | — | — | `bed_reservations` |
| BA-04 | Customer bed pick at booking | Hold reservation | Part of createBooking | `/booking/new` | `booking.ts` | `bed_reservations` |

---

## 12. Resident Lifecycle

**STATUS:** NOT TESTED

| ID | Test case | Expected behavior | Actual behavior (audit) | Screens | Services | Tables |
|----|-----------|-------------------|---------------------------|---------|----------|--------|
| RL-01 | Journey steps gate UI | Identity → bed → deposit → active | `residencyJourney.ts` | `/account/resident` | `residentAccountContext.ts` | multiple |
| RL-02 | Financial summary single source | Same totals everywhere | RFE SSOT | hub tabs | `residentFinancialEngine.ts` | read many |
| RL-03 | Applicant vs resident hub | Applicant limited view | H10: My stay missing for applicants | profile resident section | — | — |
| RL-04 | Timeline events | Chronological history | `residentTimeline.ts` | admin timeline | `residentTimeline.ts` | many |

---

## 13. Requests

**STATUS:** NOT TESTED

| ID | Test case | Expected behavior | Actual behavior (audit) | Screens | Services | Tables |
|----|-----------|-------------------|---------------------------|---------|----------|--------|
| RQ-01 | Submit deposit refund | Row in resident_requests | Verified | resident hub | `residentRequests.ts` | `resident_requests` |
| RQ-02 | Admin complete legacy | Ledger settled | `settleDepositWithDeductions` | `/admin/requests` | `depositSettlement.ts` | `deposit_ledger` |
| RQ-03 | Dedup when checkout exists | Legacy hidden/skipped | `adminRefundQueue.ts` | admin requests | `adminRefundQueue.ts` | `checkout_settlements` |
| RQ-04 | Action item sync | Badge on sidebar | `syncResidentRequestActionItems` | `/admin/actions` | `actionItems.ts` | `action_items` |

---

## 14. Vacating

**STATUS:** NOT TESTED

| ID | Test case | Expected behavior | Actual behavior (audit) | Screens | Services | Tables |
|----|-----------|-------------------|---------------------------|---------|----------|--------|
| V-01 | Resident submit | Pending vacating | Verified | request-vacating page | `vacating.ts` | `vacating_requests` |
| V-02 | Admin approve | Checkout settlement created | Verified | `/admin/vacating` | `checkoutSettlement.ts` | `checkout_settlements` |
| V-03 | Notice penalty | Applied if short notice | `vacatingPenalty()` | — | `billing.ts` | `rent_invoices` |
| V-04 | Complete blocked if checkout | Cannot double-complete | Guard in service | — | `vacating.ts` | — |

---

## 15. Checkout Settlement

**STATUS:** PASS

| ID | Test case | Expected behavior | Actual behavior (audit) | Screens | Services | Tables |
|----|-----------|-------------------|---------------------------|---------|----------|--------|
| CS-01 | Create from vacating approve | awaiting_resident_details | Verified | checkout-settlements | `checkoutSettlement.ts` | `checkout_settlements` |
| CS-02 | Resident submits meter/UPI | awaiting_admin_review | Verified | resident checkout UI | `checkoutSettlement.ts` | `checkout_settlements` |
| CS-03 | Admin approve | Deductions + occupancy finalize | Unit tested deductions | `/admin/checkout-settlements/[id]` | `checkoutSettlement.ts`, `vacating.ts` | many |
| CS-04 | Mark refund paid | completed | Verified | checkout detail | `markCheckoutRefundPaid()` | `deposit_ledger` |
| CS-05 | Zero refund path | completed without refund_pending | Status machine | — | `checkoutSettlement.ts` | — |

---

## 16. Refunds

**STATUS:** NOT TESTED

| ID | Test case | Expected behavior | Actual behavior (audit) | Screens | Services | Tables |
|----|-----------|-------------------|---------------------------|---------|----------|--------|
| RF-01 | Checkout deposit refund | Ledger refunded entry | Canonical | checkout-settlements | `settleDepositRefund()` | `deposit_ledger` |
| RF-02 | Invoice refund | financial_invoices refunded | Verified | admin invoice | `refundUnifiedInvoice()` | `financial_invoices` |
| RF-03 | Admin direct deposit refund | Ledger entry | deposit detail | `/admin/deposits/[bookingId]` | `depositSettlement.ts` | `deposit_ledger` |
| RF-04 | No double refund | One path only | Dedup logic — needs E2E | multiple | `adminRefundQueue.ts` | — |

---

## 17. Wallet

**STATUS:** NOT TESTED

| ID | Test case | Expected behavior | Actual behavior (audit) | Screens | Services | Tables |
|----|-----------|-------------------|---------------------------|---------|----------|--------|
| W-01 | Wallet tab shows ledger | Matches deposit_ledger | Display layer | `?tab=wallet` | `walletLedger.ts` | read `deposit_ledger` |
| W-02 | Held balance | Same as getDepositSummary | RFE | wallet tab | `residentFinancialEngine.ts` | — |
| W-03 | Pay CTAs | Link to deposit due / pay pages | UI wiring | wallet tab | — | — |
| W-04 | Admin rebuild wallet | Reconcile display | Admin tool | deposit detail | `depositOperations.ts` | `deposit_ledger` |

---

## 18. Notifications

**STATUS:** NOT TESTED

| ID | Test case | Expected behavior | Actual behavior (audit) | Screens | Services | Tables |
|----|-----------|-------------------|---------------------------|---------|----------|--------|
| N-01 | Booking confirmed email | Row in email_delivery_log | Hook exists | — | `notifications.ts` | `email_delivery_log` |
| N-02 | Resident notification tab | Lists sent emails | Query exists | `?tab=notifications` | `customerNotifications.ts` | `email_delivery_log` |
| N-03 | Admin unread badges | Sync from action_items | API exists | header bell | `actionItems.ts` | `admin_notifications` |
| N-04 | Rent reminder cron | Emails sent | automation cron | — | `notifications.ts` | `email_delivery_log` |
| N-05 | Health audit stale hrefs | Report mismatches | `systemHealthAudit.ts` | `/admin/health` | — | `admin_notifications` |

---

## Cross-cutting test cases

| ID | Area | Expected | Actual | Status |
|----|------|----------|--------|--------|
| X-01 | Financial summary parity | Hub = admin resident = RFE | Same loader | NOT TESTED |
| X-02 | Offline vs QR payment parity | Identical ledger outcome | Offline skips ledger | **FAIL** |
| X-03 | rent_invoices ↔ financial_invoices | 1:1 for rent type | Async sync | NOT TESTED |
| X-04 | Occupancy calendar | Matches active reservations | GiST SSOT | NOT TESTED |
| X-05 | Receipt from hub | Link to `/account/payments/[id]/receipt` | H10: missing nav | **FAIL** nav |

---

## Verification scripts (staging)

Run against staging DB before marking PASS:

```bash
npx tsx scripts/verify-booking.ts
npx tsx scripts/verify-deposit-ledger.ts
npx tsx scripts/verify-rent-billing.ts
npx tsx scripts/verify-invoice-command-center.ts
npx tsx scripts/verify-razorpay-production.ts  # if Razorpay enabled
```

Unit tests:

```bash
npm test -- tests/unit/bookingCheckoutTotals.test.ts
npm test -- tests/unit/depositSsot.test.ts
npm test -- tests/unit/checkoutSettlementDeductions.test.ts
npm test -- tests/unit/billing.test.ts
```

---

## Workflow close checklist

Use this when permanently closing a topic:

- [ ] All test cases for workflow marked PASS (manual + automated)
- [ ] Known FAIL items fixed or route disabled
- [ ] SSOT documented and agreed in `SYSTEM_TRUTH_MAP.md`
- [ ] Duplicate paths merged or explicitly deprecated
- [ ] Staging script run logged with date
- [ ] Section updated in this matrix with verifier name + date

**Suggested close order:**

1. **Booking** — B-01 to B-06  
2. **Booking Payment** — fix BP-03 first  
3. **Deposits + Deposit Transfers** — D-01 to D-06, DT-01 to DT-04  
4. **Payment Proof** — PP-01 to PP-06  
5. **Revenue + Rent Billing** — RV + RB  
6. **Invoices** — INV-01 to INV-05  
7. **Electricity** — EB-01 to EB-05  
8. **KYC + Bed Assignment + Lifecycle**  
9. **Vacating + Checkout + Refunds + Requests**  
10. **Wallet + Notifications**

---

*Update this matrix after each verification session. Do not add features until the assigned workflow section is closed.*

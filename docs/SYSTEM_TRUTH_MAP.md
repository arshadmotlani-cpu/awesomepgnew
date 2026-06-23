# Awesome PG — System Truth Map

**Purpose:** Complete operational map of every major workflow before further feature development.  
**Method:** Static code trace only (entry screens → routes → actions → services → schema). No runtime E2E in this audit.  
**Date:** 13 June 2026  
**Build:** `main` passes TypeScript production build at time of audit.  
**Companions:** [`SYSTEM_GRAPH.md`](./SYSTEM_GRAPH.md) · [`MASTER_TEST_MATRIX.md`](./MASTER_TEST_MATRIX.md)

---

## Workflow index (18)

| # | Workflow | Section | SSOT |
|---|----------|---------|------|
| 1 | Booking | §1 | `createBooking()` · `bed_reservations` |
| 2 | Booking Payment | §2 | `recordPaymentSuccess()` |
| 3 | Payment Proof Approval | §6 | `paymentProofQueue.ts` → kind-specific `record*Success` |
| 4 | Revenue | §7 | `generateRentInvoicesForMonth()` · `revenueCommandCenter.ts` (read) |
| 5 | Invoices | §14 | `financial_invoices` · `invoiceDocumentModel.ts` |
| 6 | Deposits | §3 | `deposit_ledger` · `deposits.ts` |
| 7 | Deposit Transfers | §16 | `transferOldDepositAdmin()` · `depositCredit.ts` |
| 8 | Rent Billing | §4 | `rent_invoices` · `rentInvoices.ts` |
| 9 | Electricity Billing | §5 | `electricity_bills` + `electricity_invoices` |
| 10 | KYC | §8 | `kyc_submissions` · `kyc.ts` |
| 11 | Bed Assignment | §9 | `bed_reservations` GiST · `tenantAssignment.ts` |
| 12 | Resident Lifecycle | §10 | `residencyJourney.ts` · `residentFinancialEngine.ts` |
| 13 | Requests | §17 | `resident_requests` · `residentRequests.ts` |
| 14 | Vacating | §11 | `vacating_requests` · `vacating.ts` |
| 15 | Checkout Settlement | §12 | `checkout_settlements` · `checkoutSettlement.ts` |
| 16 | Refunds | §13 | `settleDepositRefund()` · `refundUnifiedInvoice()` |
| 17 | Wallet | §15 | `getDepositSummaryForBooking()` · `buildWalletLedger()` |
| 18 | Notifications | §18 | `email_delivery_log` · `sendEmail()` hooks |

---

## Status legend

| Status | Meaning |
|--------|---------|
| **VERIFIED** | Entry points, service chain, and DB writes are traceable in code; helper logic has unit tests or scripts. |
| **NEEDS TEST** | Code path exists and appears wired, but lacks automated integration/E2E coverage for the full workflow. |
| **BROKEN** | Known parallel path or side-effect gap that can leave ledger/invoice/occupancy inconsistent with SSOT. |
| **UNKNOWN** | Static audit cannot confirm runtime behavior (cron timing, webhook delivery, production-only flags). |

---

## Architecture overview

```mermaid
flowchart TB
  subgraph customer [Customer]
    BN[/booking/new]
    BP[/booking/code/pay]
    RH[/account/profile?section=resident]
  end

  subgraph admin [Admin]
    AR[/admin/revenue/billing]
    AD[/admin/deposits]
    ACS[/admin/checkout-settlements]
  end

  subgraph core [Service SSOT]
    CB[booking.ts createBooking]
    BL[bookingLifecycle recordPaymentSuccess]
    RI[rentInvoices.ts]
    EB[electricityBilling.ts]
    DL[deposits.ts deposit_ledger]
    UI[unifiedInvoices.ts financial_invoices]
    CS[checkoutSettlement.ts]
  end

  BN --> CB
  BP --> QR[qrPayments submitBookingPaymentRecord]
  QR --> AR
  AR --> BL
  BL --> DL
  CB --> BR[(bed_reservations)]
  BL --> BR
  CRON[generate-monthly-rent cron] --> RI
  RI --> UI
  EB --> UI
  RH --> RFE[residentFinancialEngine]
  AD --> DL
  ACS --> CS
  CS --> DL
```

**Financial SSOT hierarchy**

| Layer | Source of truth |
|-------|-----------------|
| Deposit money | `deposit_ledger` per booking (`src/services/deposits.ts`) |
| Rent | `rent_invoices` (`src/services/rentInvoices.ts`) |
| Electricity | `electricity_bills` + `electricity_invoices` (`src/services/electricityBilling.ts`) |
| Unified registry | `financial_invoices` (`src/services/unifiedInvoices.ts`) |
| Resident outstanding | `getResidentFinancialSummary()` (`src/services/residentFinancialEngine.ts`) |
| Occupancy | `bed_reservations.stay_range` + GiST EXCLUDE (`src/db/schema/bedReservations.ts`) |

---

## 1. Booking

| Field | Detail |
|-------|--------|
| **Status** | **VERIFIED** (create path) · **NEEDS TEST** (race/overlap concurrency) |

### Trigger

| Actor | Trigger | Entry |
|-------|---------|-------|
| Customer | Cart submit on `/booking/new` | `createBookingAction` → `app/(customer)/booking/new/actions.ts` |
| Admin | Assign tenant | `assignTenantAction` → `app/(admin)/admin/bookings/new/actions.ts` |
| Admin | Express walk-in | `expressWalkInSaleAction` → `app/(admin)/admin/quick-actions/actions.ts` |
| Cron | Hold expiry | `GET/POST /api/cron/release-holds` → `releaseExpiredHolds()` |
| Customer | Cancel | `cancelBookingAction` → `app/(customer)/booking/[bookingCode]/actions.ts` |

### Server actions

- `createBookingAction` — customer cart
- `assignTenantAction` — admin bed assign
- `expressWalkInSaleAction` — admin walk-in sale
- `cancelBookingAction` — customer cancel

### Services called

| Service | File | Role |
|---------|------|------|
| `createBooking()` | `src/services/booking.ts` | Transactional heart: customer upsert, pricing snapshot, booking + reservations |
| `quoteBookingPrice()` | `src/services/pricing.ts` | Price/deposit quote |
| `isBedAvailable()` | `src/services/availability.ts` | Pre-flight overlap check |
| `assignTenantToBed()` | `src/services/tenantAssignment.ts` | Admin assign → `createBooking(createdVia:'admin')` |
| `executeExpressWalkInSale()` | `src/services/expressWalkInSale.ts` | Walk-in orchestration |
| `releaseExpiredHolds()` / `cancelBooking()` | `src/services/bookingLifecycle.ts` | Hold release / cancellation |

### Database tables touched

**Writes:** `customers`, `bookings`, `bed_reservations`, `coupon_redemptions` (optional), `audit_log`  
**Reads:** `beds`, `rooms`, `floors`, `pgs`, `bed_prices`  
**Constraints:** GiST EXCLUDE on `bed_reservations.stay_range`; unique `bookings.booking_code`

### State machine (create)

| `createdVia` | `bookings.status` | `bed_reservations.status` | `hold_expires_at` |
|--------------|-------------------|---------------------------|-------------------|
| `customer` | `pending_payment` | `hold` | `now + BOOKING_HOLD_MINUTES` |
| `admin` | `confirmed` | `active` | `null` |

### Impacts

| Domain | Impact |
|--------|--------|
| **Invoice** | None at create. Rent invoices come from workflow 4/7. |
| **Revenue** | None at create. |
| **Occupancy** | `hold` (customer) or `active` (admin) reservations block calendar. |
| **Resident** | Pre-resident until `confirmed`. Admin assign sets `customers.residency_status = 'active'`. |
| **Admin** | `/admin/bookings`, `/admin/bookings/new`, `/admin/bookings/[bookingId]`, `/admin/quick-actions`, `/admin/pgs/[pgId]/map` |

### Notes

- Deposit credit from prior bookings is **not** auto-applied at customer create (post–deposit isolation fix).
- Admin may pass `depositCreditAppliedPaise` explicitly on walk-in/assign paths.

---

## 2. Booking Payment

| Field | Detail |
|-------|--------|
| **Status** | **VERIFIED** (QR proof path) · **BROKEN** (admin offline path) · **NEEDS TEST** (Razorpay E2E) · **UNKNOWN** (webhook delivery in prod) |

### Trigger

| Actor | Trigger | Entry |
|-------|---------|-------|
| Customer | UPI screenshot on pay page | `POST /api/payment-record/booking` → `submitBookingPaymentRecord()` |
| Admin | Approve QR proof | `approveQrPaymentAction` → `reviewPaymentRecord()` → `recordPaymentSuccess()` |
| Admin | Partial deposit approve | `approvePartialQrPaymentAction` |
| Razorpay | Webhook / verify | `/api/webhooks/razorpay`, `/api/payments/razorpay/verify` → `recordPaymentSuccess()` |
| Admin | Offline payment on booking detail | `recordOfflinePaymentAction` ⚠️ **parallel path** |
| Cron | Hold expiry | `releaseExpiredHolds()` |
| Admin | Reject proof | `rejectQrPaymentAction` → `cleanupRejectedBookingRequest()` |

### Server actions

- `approveQrPaymentAction`, `approvePartialQrPaymentAction`, `rejectQrPaymentAction` — `app/(admin)/admin/payments/actions.ts`
- `recordOfflinePaymentAction` — `app/(admin)/admin/bookings/[bookingId]/actions.ts`
- Customer upload via API routes (not server actions)

### Services called

| Service | File | Role |
|---------|------|------|
| `submitBookingPaymentRecord()` | `src/services/qrPayments.ts` | Insert `pg_payment_records`, extend hold, `markBookingAwaitingApproval()` |
| `reviewPaymentRecord()` | `src/services/qrPayments.ts` | Approve → `recordPaymentSuccess(provider:'upi_manual')` |
| `recordPaymentSuccess()` | `src/services/bookingLifecycle.ts` | Idempotent confirm: payments, booking/reservations, deposit ledger |
| `validateBookingPayment()` | `src/services/depositCollection.ts` | Rent/deposit split |
| `recordDepositCollected()` | `src/services/deposits.ts` | Mirror deposit to ledger |
| `applyDepositCreditToBooking()` | `src/services/depositCredit.ts` | Admin-explicit transfer only |
| `applyPriorOutstandingFromCheckoutPayment()` | `src/services/bookingPriorOutstanding.ts` | Prior-stay balances |
| `verifyRazorpayCheckoutPayment()` | `src/services/paymentVerification.ts` | Signature verify → lifecycle |

### Database tables touched

`payments`, `bookings`, `bed_reservations`, `pg_payment_records`, `pg_payment_categories`, `deposit_ledger`, `audit_log`, optional `playstation_memberships`

### Payment approval state machine

```
createBooking           → pending_payment + hold
submit UPI proof        → pending_approval
admin approve / Razorpay→ confirmed + active reservations
admin reject            → cancelled
```

### Impacts

| Domain | Impact |
|--------|--------|
| **Invoice** | No monthly rent invoice at checkout. |
| **Revenue** | Booking payment recorded in `payments` (purpose `booking`); not monthly rent revenue. |
| **Occupancy** | `hold` → `active` on primary reservations. |
| **Resident** | `confirmed` unlocks resident hub. Emails: booking confirmed, payment receipt. |
| **Admin** | `/admin/operations/payment-reviews`, `/admin/revenue/billing`, `/admin/bookings/[bookingId]` |

### BROKEN — admin offline payment bypass

`recordOfflinePaymentAction` writes `payments` and flips `bookings`/`bed_reservations` **directly** in a transaction. It does **not** call `recordPaymentSuccess()`.

**Missing side effects:** deposit ledger mirror, prior outstanding allocation, partial deposit workflow, PS4 activation, deposit credit transfer, `applyFullDepositOnConfirm`, automation events.

**File:** `app/(admin)/admin/bookings/[bookingId]/actions.ts` L88–223

### NEEDS TEST

- Customer pay page is **QR + proof only** (`BookingCheckoutExperience`); Razorpay UI not wired to booking pay page despite webhook infrastructure existing.
- Deposit ledger errors in `recordPaymentSuccess` are caught and logged only — booking still confirms (`bookingLifecycle.ts`).

---

## 3. Deposit

| Field | Detail |
|-------|--------|
| **Status** | **VERIFIED** (ledger SSOT) · **NEEDS TEST** (checkout + transfer E2E) |

### Trigger

| Trigger | Path |
|---------|------|
| Booking checkout payment | `recordPaymentSuccess()` → `recordDepositCollected()` |
| Admin add deposit | `addDepositAction` → `app/(admin)/admin/deposits/[bookingId]/actions.ts` |
| Admin advance deposit | `recordAdvanceDepositAction` → `app/(admin)/admin/deposits/advance/actions.ts` |
| Admin transfer old deposit | `transferOldDepositAction` → `app/(admin)/admin/deposits/deposit-wallet-actions.ts` |
| Express walk-in / collection | `expressWalkInSale.ts`, `expressCollection.ts` |
| Partial deposit QR approve | `approvePartialQrPaymentAction` |
| Checkout settlement | `checkoutSettlement.ts`, `depositSettlement.ts` |
| Deposit link proof approve | `approveDepositLinkProofAction` |
| Cron | `markOverdueDeposits()` via action items |

### Server actions

- `addDepositAction`, `deductDepositAction`, `refundDepositAction`, `correctDepositAction` — deposits detail
- `transferOldDepositAction`, `editDepositSummaryAction`, `rebuildDepositWalletAction` — `deposit-wallet-actions.ts`
- `processDepositSettlementAction` — `settlementActions.ts`
- `submitDepositDueExtensionRequestAction` — customer `deposit-actions.ts`

### Services called

| Service | File |
|---------|------|
| `recordDepositCollected()`, `getDepositSummaryForBooking()` | `src/services/deposits.ts` |
| `validateBookingPayment()`, `syncDepositCollectionFromLedger()`, `applyPartialDepositOnConfirm()` | `src/services/depositCollection.ts` |
| `applyDepositDeduction()`, `settleDepositRefund()` | `src/services/depositSettlement.ts` |
| `transferOldDepositAdmin()`, `applyDepositCreditToBooking()` | `src/services/depositCredit.ts` |
| `rebuildDepositWallet()`, `updateDepositSummaryAdmin()` | `src/services/depositOperations.ts` |
| Admin display | `src/services/depositInvoices.ts`, `src/lib/deposits/unifiedDepositView.ts` |

### Database tables touched

`deposit_ledger`, `deposit_settlements`, `bookings` (deposit fields + `pricing_snapshot.depositCredit`), `payments`, `audit_log`, `financial_invoices`, `payment_links`, `resident_requests`, `checkout_settlements`, `vacating_requests`

### Impacts

| Domain | Impact |
|--------|--------|
| **Invoice** | Deposit-due via `financial_invoices`; admin `depositInvoices.ts` status model |
| **Revenue** | Collected deposit = **liability**, not recognized revenue |
| **Occupancy** | Partial deposit can gate move-in (`deposit_collection_status`) |
| **Resident** | Wallet tab held balance; deposit due payment links |
| **Admin** | `/admin/deposits`, `/admin/deposits/[bookingId]`, `/admin/deposits/add`, `/admin/deposits/advance`, `/admin/pgs/[pgId]/collections` |

### Business rules (verified in code)

- Cross-booking deposit credit applies **only** when `pricing_snapshot.depositCredit.adminTransferred === true`.
- Admin explicit transfer: `transferOldDepositAdmin()` — audit log + ledger + snapshot stamp.

---

## 4. Rent Billing

| Field | Detail |
|-------|--------|
| **Status** | **VERIFIED** (generation + payment paths) · **NEEDS TEST** (cron batch at scale) |

### Trigger

| Trigger | Path |
|---------|------|
| Daily cron | `/api/cron/generate-monthly-rent` → `generateRentInvoicesForMonth()` |
| Admin manual generate | `generateInvoicesAction` → `app/(admin)/admin/rent/actions.ts` |
| On-demand ensure | `ensureMonthlyRentInvoice()` (express collection, quick-actions) |
| Vacating notice | `syncVacatingCheckoutRentBilling()` |
| Payment — Razorpay | webhook → `recordRentPaymentSuccess()` |
| Payment — UPI proof | `submitRentPaymentProof()` → admin `approveRentPaymentProof()` |
| Express collection | `recordExpressCollection(chargeType:'rent')` |

### Server actions

- `generateInvoicesAction`, `generateDueInvoicesAction`, `cancelPendingInvoicesAction` — `app/(admin)/admin/rent/actions.ts`
- `approveRentProofAction`, `rejectRentProofAction` — `app/(admin)/admin/payments/actions.ts`

### Services called

| Service | File |
|---------|------|
| `generateRentInvoicesForMonth()`, `ensureMonthlyRentInvoice()`, `recordRentPaymentSuccess()`, `projectInvoice()` | `src/services/rentInvoices.ts` |
| `dueDateForMonth()`, `computeLateFee()`, `prorateForMonth()` | `src/services/billing.ts` |
| `ensureBillingProfileForBooking()` | `src/services/residentBillingProfiles.ts` |
| `syncRentInvoiceToUnified()` | `src/services/unifiedInvoices.ts` |
| `buildRentCategory()` | `src/services/residentFinancialEngine.ts` |

### Database tables touched

`rent_invoices`, `payments`, `financial_invoices`, `payment_links`, `bookings`, `bed_reservations`, `resident_billing_profiles`, `audit_log`

**Statuses:** `pending`, `payment_in_progress`, `paid`, `overdue`, `expired`, `cancelled`

### Impacts

| Domain | Impact |
|--------|--------|
| **Invoice** | `RNT-YYYY-MM-NNNN`; pro-rated first/last month |
| **Revenue** | Feeds `revenueCommandCenter.ts`, `/admin/revenue` KPIs |
| **Occupancy** | Eligibility: confirmed + monthly/open_ended + active reservation in billing month |
| **Resident** | `/account/resident/pay-rent/[invoiceId]`, Payments hub |
| **Admin** | `/admin/revenue`, `/admin/revenue/billing`, `/admin/revenue/rent-due`, `/admin/rent` |

### NEEDS TEST

- `syncRentInvoiceToUnified()` on generate is fire-and-forget — sync failure silent at generation time.

---

## 5. Electricity Billing

| Field | Detail |
|-------|--------|
| **Status** | **VERIFIED** · **NEEDS TEST** (multi-occupant split edge cases) |

### Trigger

| Trigger | Path |
|---------|------|
| Admin meter entry | `createElectricityBillAction` → `app/(admin)/admin/electricity/new/actions.ts` |
| Payment — Razorpay | webhook → `recordElectricityPaymentSuccess()` |
| UPI proof | `submitElectricityPaymentProof()` → `approveElectricityPaymentProof()` |
| Express collection | `expressCollection.ts` |
| Vacating complete | `cancelElectricityInvoicesForBooking()` |
| Automation | `electricity_due` events (~2 days before due) |

### Server actions

- `createElectricityBillAction` — `app/(admin)/admin/electricity/new/actions.ts`
- `approveElectricityProofAction`, `rejectElectricityProofAction` — payments actions

### Services called

| Service | File |
|---------|------|
| `createElectricityBill()`, `recordElectricityPaymentSuccess()`, `projectElectricityInvoice()` | `src/services/electricityBilling.ts` |
| `submitElectricityPaymentProof()` | `src/services/meterElectricity.ts` |
| `splitElectricity()`, `electricityDueDate()` | `src/services/billing.ts` |

### Database tables touched

`electricity_bills`, `electricity_invoices`, `rooms.electricity_prepaid_credit_paise`, `room_electricity_prepaid_ledger`, `payments`, `financial_invoices`, `meter_logs`, `bed_reservations`, `bookings`, `beds`, `rooms`

### Impacts

| Domain | Impact |
|--------|--------|
| **Invoice** | `ELE-YYYY-MM-NNNN` per occupant per room bill |
| **Revenue** | Electricity category in resident financial summary |
| **Occupancy** | Split among active monthly occupants in room |
| **Resident** | `/account/resident/pay-electricity/[invoiceId]` |
| **Admin** | `/admin/electricity`, `/admin/electricity/new`, rooms-pending panel |

---

## 6. Payment Proof Approval

| Field | Detail |
|-------|--------|
| **Status** | **VERIFIED** · **NEEDS TEST** (multi-kind queue E2E) |

### Trigger

Resident uploads screenshot → row enters pending queue with non-null proof URL.

| Kind | Submit path | Table |
|------|-------------|-------|
| QR booking | `/api/payment-record/booking` | `pg_payment_records` |
| QR category | `/api/payment-record` | `pg_payment_records` |
| Rent | `/api/rent-invoice/[id]/payment-proof` | `rent_invoices` |
| Electricity | `/api/electricity-invoice/[id]/payment-proof` | `electricity_invoices` |
| Extension | `/api/stay-extension/[id]/payment-proof` | `stay_extensions` |
| Deposit link | `pay/actions.ts` | `payment_links` |

### Server actions

All in `app/(admin)/admin/payments/actions.ts` (`payments:write`):

`approveQrPaymentAction`, `approvePartialQrPaymentAction`, `rejectQrPaymentAction`, `approveRentProofAction`, `rejectRentProofAction`, `approveElectricityProofAction`, `rejectElectricityProofAction`, `approveExtensionProofAction`, `rejectExtensionProofAction`, `approveDepositLinkProofAction`, `rejectDepositLinkProofAction`

### Services called

| Service | File |
|---------|------|
| `listPendingPaymentReviews()` | `src/services/paymentProofQueue.ts` |
| `reviewPaymentRecord()` | `src/services/qrPayments.ts` |
| `recordPaymentSuccess()` | `src/services/bookingLifecycle.ts` |
| `recordRentPaymentSuccess()` | `src/services/rentInvoices.ts` |
| `recordElectricityPaymentSuccess()` | `src/services/electricityBilling.ts` / `meterElectricity.ts` |
| `recordExtensionPaymentSuccess()` | `src/services/bookingLifecycle.ts` |
| `recordDepositPaymentFromLink()` | `src/services/depositCollection.ts` |

### Database tables touched

Depends on kind: `pg_payment_records`, `rent_invoices`, `electricity_invoices`, `stay_extensions`, `payment_links`, plus downstream `payments`, `bookings`, `deposit_ledger`, `financial_invoices`

### Impacts

| Domain | Impact |
|--------|--------|
| **Invoice** | Rent/elec approve syncs to `financial_invoices` |
| **Revenue** | Payment recorded; revenue metrics update on approve |
| **Occupancy** | QR booking approve activates reservations |
| **Resident** | Booking confirmed / invoice marked paid |
| **Admin** | **`/admin/operations/payment-reviews`** (SSOT queue); `/admin/payments` redirects here |

---

## 7. Revenue Creation

| Field | Detail |
|-------|--------|
| **Status** | **VERIFIED** (rent invoice generation) · **NEEDS TEST** (cron reliability) · **UNKNOWN** (production cron schedule) |

Interpreted as **monthly rent invoice generation** (not read-only Revenue Command Center).

### Trigger

| Trigger | Path |
|---------|------|
| Daily cron | `/api/cron/generate-monthly-rent` |
| Admin batch | `generateInvoicesAction` / `generateDueInvoicesAction` |
| On-demand | `ensureMonthlyRentInvoice()` |
| Express walk-in | `recordExpressCollection(chargeType:'rent')` |
| Combined invoices | `invoiceGeneration.ts` → `financial_invoices` |

### Server actions

- `generateInvoicesAction`, `generateDueInvoicesAction` — `app/(admin)/admin/rent/actions.ts`

### Services called

| Service | File |
|---------|------|
| `generateRentInvoicesForMonth()`, `ensureMonthlyRentInvoice()` | `src/services/rentInvoices.ts` |
| `getRevenueCommandCenterData()` | `src/services/revenueCommandCenter.ts` (read-only reporting) |
| `syncRentInvoiceToUnified()` | `src/services/unifiedInvoices.ts` |

### Database tables touched

`rent_invoices`, `financial_invoices`, `bookings`, `bed_reservations`, `customers`, `resident_billing_profiles`, `audit_log`

### Eligibility (verified)

- `bookings.status = 'confirmed'`
- `duration_mode ∈ ('monthly', 'open_ended')`
- Active `bed_reservations` intersecting billing month
- Rent from `pricing_snapshot` (not live `bed_prices`)
- `UNIQUE(booking_id, billing_month)`

### Impacts

| Domain | Impact |
|--------|--------|
| **Invoice** | Creates `rent_invoices` + async unified sync |
| **Revenue** | Outstanding/collected rent KPIs on `/admin/revenue` |
| **Occupancy** | Read-only eligibility check |
| **Resident** | Bills appear in Payments hub; action items `rent_due` |
| **Admin** | `/admin/revenue`, `/admin/revenue/billing`, `/admin/revenue/rent-due` |

---

## 8. KYC

| Field | Detail |
|-------|--------|
| **Status** | **VERIFIED** · **NEEDS TEST** (image validation edge cases) |

### Trigger

| Actor | Trigger |
|-------|---------|
| Customer | Upload on `/account/profile?section=identity` (`submitKycAction`) |
| Admin | Approve/reject on `/admin/residents/kyc/[submissionId]` |

### Server actions

- `submitKycAction` — `app/(customer)/account/kyc/actions.ts` (redirects from `/account/kyc`)
- KYC review actions — `app/(admin)/admin/residents/kyc/actions.ts`

### Services called

| Service | File |
|---------|------|
| `submitKyc()`, `reviewKycSubmission()` | `src/services/kyc.ts` |
| `getCustomerKycUploadContext()` | `src/services/kycEligibility.ts` |
| `validateKycImage()` | `src/services/kycValidation.ts` |
| `getCustomerVerificationStatus()` | `src/services/residentAdmin.ts` |

### Database tables touched

`kyc_submissions`, `customers.kyc_status`, `audit_log`, optional `bookings` FK on submission

### Impacts

| Domain | Impact |
|--------|--------|
| **Invoice** | None |
| **Revenue** | None |
| **Occupancy** | Blocks `assignTenantToBed()` if unverified |
| **Resident** | Identity phase on home until approved; check-in banner |
| **Admin** | `/admin/residents/kyc`, `/admin/residents/kyc/[submissionId]`, resident profile KYC section |

---

## 9. Bed Assignment

| Field | Detail |
|-------|--------|
| **Status** | **VERIFIED** · **NEEDS TEST** (GiST race under concurrent assign) |

### Trigger

| Actor | Trigger |
|-------|---------|
| Admin | Bed map assign, `/admin/beds`, resident profile assign, `/admin/bookings/new` |
| Admin | Reassign via `updateTenancyAction` |
| Customer | Bed selection at booking (creates reservation, not admin assign) |

### Server actions

- `assignTenantAction` — `app/(admin)/admin/bookings/new/actions.ts`
- `updateTenancyAction` — resident admin actions
- PG map actions — `app/(admin)/admin/pgs/[pgId]/map/actions.ts`

### Services called

| Service | File |
|---------|------|
| `assignTenantToBed()` | `src/services/tenantAssignment.ts` |
| `isBedAvailable()` | `src/services/availability.ts` |
| `loadBedAssignmentCommand()` | `src/services/bedAssignmentCommand.ts` |
| `getPgBedMap()` | `src/services/pgBedMap.ts` |
| `reconcileBookingOccupancy()` | `src/lib/occupancySync.ts` |
| `createBooking()` | `src/services/booking.ts` (admin path) |

### Database tables touched

`bed_reservations`, `bookings`, `beds`, `bed_prices`, `customers.residency_status`

**Constraint:** GiST EXCLUDE `no_overlap_per_bed` — only `active` reservations block public calendar.

### Impacts

| Domain | Impact |
|--------|--------|
| **Invoice** | Triggers billing profile + future rent generation eligibility |
| **Revenue** | Indirect via move-in date / billing day |
| **Occupancy** | Primary SSOT for bed calendar |
| **Resident** | `residency_status = 'active'` on assign |
| **Admin** | `/admin/beds`, `/admin/pgs/[pgId]/map`, `/admin/residents/[customerId]` |

---

## 10. Resident Lifecycle

| Field | Detail |
|-------|--------|
| **Status** | **VERIFIED** (state model) · **NEEDS TEST** (full journey E2E) |

### Journey steps (SSOT)

`src/lib/residents/residencyJourney.ts`:

1. Account created (profile complete)
2. Identity verified (KYC approved)
3. Bed assignment (confirmed booking)
4. Deposit payment (outstanding = 0)
5. Active stay (`residency_status = active`)

### Trigger / transitions

| Event | Booking | Reservation | Residency |
|-------|---------|-------------|-----------|
| `createBooking` (customer) | `pending_payment` | `hold` | — |
| `recordPaymentSuccess` | `confirmed` | `active` | — |
| `assignTenantToBed` | `confirmed` | `active` | `active` |
| Vacating/checkout complete | `completed` | `completed` | `vacated` |
| Hold expiry / reject | `cancelled` | `cancelled` | — |

### Server actions / loaders

- `loadResidentAccountContext()` — `src/services/residentAccountContext.ts`
- Hub render — `ResidentAreaSection.tsx` via `/account/profile?section=resident`

### Services called

`residentFinancialEngine.ts`, `residentTimeline.ts`, `residentOperationsDashboard.ts`, `bookingLifecycle.ts`, `tenantAssignment.ts`, `vacating.ts`, `checkoutSettlement.ts`

### Database tables touched

`customers`, `bookings`, `bed_reservations`, `payments`, `pg_payment_records`, `rent_invoices`, `electricity_invoices`, `deposit_ledger`, `resident_billing_profiles`, `kyc_submissions`, `vacating_requests`, `checkout_settlements`

### Impacts

| Domain | Impact |
|--------|--------|
| **Invoice** | Full billing stack once confirmed + active |
| **Revenue** | Resident becomes rent/elec revenue source |
| **Occupancy** | Active reservation holds bed |
| **Resident** | `/account/resident` → hub tabs (home, wallet, payments, …) |
| **Admin** | `/admin/residents`, `/admin/residents/[customerId]`, `/admin/operations/residents` |

---

## 11. Vacating

| Field | Detail |
|-------|--------|
| **Status** | **VERIFIED** · **NEEDS TEST** (notice penalty edge cases) |

### Trigger

| Actor | Trigger |
|-------|---------|
| Resident | `submitVacatingAction` → `app/(customer)/account/resident/actions.ts` |
| Resident | `/account/resident/request-vacating/[bookingId]` |
| Admin | `app/(admin)/admin/vacating/actions.ts`, PG map actions |
| Cron | `vacatingPastDue` via `/api/cron/automation` |

### Server actions

- `submitVacatingAction` — customer
- Vacating approve/reject/complete — admin vacating actions

### Services called

| Service | File |
|---------|------|
| `submitVacatingRequest()`, `approveVacatingRequest()`, `rejectVacatingRequest()`, `completeVacatingRequest()` | `src/services/vacating.ts` |
| `syncVacatingCheckoutRentBilling()` | `src/services/vacatingCheckoutBilling.ts` |
| `createCheckoutSettlementFromVacating()` | `src/services/checkoutSettlement.ts` |
| Notice policy | `src/services/billing.ts` — `isNoticeCompliant()`, `vacatingPenalty()` |

### Status machine

```
pending → approved → completed
pending → rejected
approved → rejected (rare)
```

On **approve:** creates `checkout_settlements` (workflow 12).

### Database tables touched

`vacating_requests`, `checkout_settlements`, `bed_reservations`, `bookings`, `customers`, `rent_invoices`, `electricity_invoices`

### Impacts

| Domain | Impact |
|--------|--------|
| **Invoice** | Pro-rate/cancel future rent on notice |
| **Revenue** | Stops future billing (`auto_generate = false` on finalize) |
| **Occupancy** | Bed pre-bookable from vacating date after approve |
| **Resident** | Vacating tab, move-out status on home |
| **Admin** | `/admin/vacating`, Operations Center, MoveOutWorkflowPanel |

### Note

`completeVacatingRequest()` is **blocked** when checkout settlement exists — checkout workflow is canonical.

---

## 12. Checkout Settlement

| Field | Detail |
|-------|--------|
| **Status** | **VERIFIED** · **NEEDS TEST** (electricity deduction math in prod) |

### Trigger

| Event | Function |
|-------|----------|
| Vacating approved | `createCheckoutSettlementFromVacating()` |
| Resident submits meter + UPI | `submitResidentCheckoutDetails()` |
| Admin approves | `approveCheckoutSettlement()` |
| Admin marks refund sent | `markCheckoutRefundPaid()` |
| Backfill | `syncMissingCheckoutSettlements()` |

### Server actions

- `approveCheckoutSettlementAction`, `markCheckoutRefundPaidAction` — `app/(admin)/admin/checkout-settlements/actions.ts`
- Customer checkout details — `app/(customer)/account/resident/request-actions.ts`

### Services called

| Service | File |
|---------|------|
| `approveCheckoutSettlement()`, `markCheckoutRefundPaid()` | `src/services/checkoutSettlement.ts` |
| `finalizeVacatingOccupancy()` | `src/services/vacating.ts` |
| `settleDepositRefund()`, `applyDepositDeduction()` | `src/services/depositSettlement.ts` |
| `buildCheckoutSettlementDeductionPlan()` | checkout settlement helpers |
| Electricity math | `src/lib/checkout/electricitySettlement.ts` |

### Status machine

```
awaiting_resident_details → awaiting_admin_review → refund_pending → refund_paid → completed
                                              └→ completed (zero refund)
archived
```

### Database tables touched

`checkout_settlements`, `vacating_requests`, `deposit_ledger`, `deposit_settlements`, `bookings`, `customers`, `bed_reservations`, `rent_invoices`, `electricity_invoices`, `resident_billing_profiles`

### Impacts

| Domain | Impact |
|--------|--------|
| **Invoice** | Cancels future rent/elec |
| **Revenue** | Final settlement; no ongoing billing |
| **Occupancy** | Reservations → `completed`; bed released |
| **Resident** | Deposit refund flow UI; payout details |
| **Admin** | **`/admin/checkout-settlements`**, `/admin/checkout-settlements/[id]` (`deposits:write`) |

---

## 13. Refunds

| Field | Detail |
|-------|--------|
| **Status** | **VERIFIED** (multiple paths) · **NEEDS TEST** (path selection when both legacy + checkout exist) |

### Refund paths

| Path | Trigger | Service | Status |
|------|---------|---------|--------|
| **A. Invoice refund** | Admin on invoice detail | `refundUnifiedInvoice()` | VERIFIED |
| **B. Checkout settlement** | Move-out canonical | `settleDepositRefund()` via checkout | VERIFIED |
| **C. Direct admin deposit** | Deposit detail panel | `settleDepositRefund()` | VERIFIED |
| **D. Legacy resident request** | `/admin/requests` | `adminReviewResidentRequest()` | VERIFIED (deduped if checkout exists) |

### Server actions

- `refundInvoiceAction` — `app/(admin)/admin/invoices/actions.ts`
- `refundDepositAction`, `processDepositSettlementAction` — deposit actions
- `approveCheckoutSettlementAction`, `markCheckoutRefundPaidAction` — checkout actions
- Legacy — `app/(admin)/admin/requests/actions.ts`

### Services called

`unifiedInvoices.ts`, `invoicePayment.ts`, `depositSettlement.ts`, `checkoutSettlement.ts`, `adminRefundQueue.ts`, `refundElectricity.ts`

### Database tables touched

`deposit_ledger`, `deposit_settlements`, `checkout_settlements`, `financial_invoices`, `payments`, `rent_invoices`, `resident_requests`

### Impacts

| Domain | Impact |
|--------|--------|
| **Invoice** | `financial_invoices.status → refunded`; source rent cancelled |
| **Revenue** | Refund reduces collected; command center `refundsPaidPaise` |
| **Occupancy** | Via checkout finalize only |
| **Resident** | Refund status on wallet / vacating journey |
| **Admin** | `/admin/checkout-settlements`, `/admin/deposits/[bookingId]`, `/admin/invoices/[invoiceId]`, `/admin/requests` |

---

## 14. Invoices

| Field | Detail |
|-------|--------|
| **Status** | **VERIFIED** · **NEEDS TEST** (unified sync consistency under load) |

### Layer model

```
rent_invoices / electricity_invoices / custom
        ↓ sync*
financial_invoices  ← registry SSOT
        ↓
invoiceDocumentModel.ts  ← display projection
        ↓
InvoiceDocument.tsx
```

### Trigger

| Event | Service |
|-------|---------|
| Rent/elec create or pay | `syncRentInvoiceToUnified()`, `syncElectricityInvoiceToUnified()` |
| Combined invoice | `invoiceGeneration.ts` |
| Admin cancel/refund/void | `cancelUnifiedInvoice()`, `refundUnifiedInvoice()`, `voidInvoiceCompletely()` |
| Payment link | `createPaymentLinkForInvoice()` |
| WhatsApp share | `sendInvoiceOnWhatsApp.ts` |

### Server actions

- `cancelInvoiceAction`, `refundInvoiceAction`, `voidInvoiceCompletelyAction`, `invoicePaymentLinkAction`, `invoiceWhatsAppAction` — `app/(admin)/admin/invoices/actions.ts`

### Services called

| Service | File |
|---------|------|
| Unified registry | `src/services/unifiedInvoices.ts` |
| Document model | `src/lib/billing/invoiceDocumentModel.ts` |
| Payment allocation | `src/services/invoicePayment.ts` |
| Command center | `src/services/invoiceCommandCenter.ts` |
| Numbering | `src/lib/billing/invoiceNumbering.ts` |
| State machine | `src/lib/billing/invoiceStateMachine.ts` |

### Database tables touched

`financial_invoices`, `invoice_audit_events`, `rent_invoices`, `electricity_invoices`, `payment_links`, `payments`

**Types:** `rent`, `deposit`, `electricity`, `ps4`, `penalty`, `damage`, `custom`, `combined`  
**Statuses:** `draft`, `sent`, `payment_in_progress`, `processing`, `paid`, `partial`, `settled`, `overdue`, `expired`, `cancelled`, `refunded`

### Shared invoice routes

| Route | Role |
|-------|------|
| `/resident/invoices/[ref]` | Canonical share URL |
| `/account/resident/invoices/[invoiceId]` | Alias redirect |

### Impacts

| Domain | Impact |
|--------|--------|
| **Invoice** | SSOT for all bill presentation |
| **Revenue** | Paid status drives revenue metrics |
| **Occupancy** | None directly |
| **Resident** | Share links (WhatsApp/email); **no hub nav link** to invoice detail (see H10 regression report) |
| **Admin** | `/admin/invoices`, `/admin/invoices/[invoiceId]`, print view |

---

## 15. Wallet / Deposit Ledger

| Field | Detail |
|-------|--------|
| **Status** | **VERIFIED** (read SSOT) · **NEEDS TEST** (cross-booking transfer E2E) |

### Architecture

| Layer | Source |
|-------|--------|
| Deposit money | `deposit_ledger` + `getDepositSummaryForBooking()` |
| Cross-booking aggregate | `getCustomerDepositCredit()` |
| All outstanding | `getResidentFinancialSummary()` — **do not duplicate** |
| UI presentation | `buildWalletLedger()` — display only |

### Trigger / loaders

| Surface | Path |
|---------|------|
| Resident wallet tab | `ResidentAreaSection.tsx` → `?tab=wallet` |
| Payment history | `/account/resident/history/[bookingId]` |
| Wallet alias | `/account/wallet` → redirect |
| Admin transfer | `TransferOldDepositPanel` → `transferOldDepositAction` |
| Admin rebuild/correct | `deposit-wallet-actions.ts` |

### Server actions

- `transferOldDepositAction`, `editDepositSummaryAction`, `rebuildDepositWalletAction`, `cancelDepositInvoiceAction` — `deposit-wallet-actions.ts`

### Services called

| Service | File |
|---------|------|
| Ledger SSOT | `src/services/deposits.ts` |
| Cross-booking credit | `src/services/depositCredit.ts` |
| Admin ops | `src/services/depositOperations.ts` |
| Financial summary | `src/services/residentFinancialEngine.ts` |
| UI ledger | `src/lib/residents/walletLedger.ts` |

### Database tables touched

`deposit_ledger`, `bookings`, `deposit_settlements`, `payments`, `rent_invoices`, `electricity_invoices`

**Balance formula:** `refundable = collected − deducted − refunded`

### Impacts

| Domain | Impact |
|--------|--------|
| **Invoice** | Wallet does not replace invoices; deposit-due in financial summary |
| **Revenue** | Wallet balance = liability, not revenue |
| **Occupancy** | Transfer adjusts target booking `total_paise` via snapshot stamp |
| **Resident** | Wallet tab: held balance, ledger, pay CTAs |
| **Admin** | `/admin/deposits/[bookingId]`, transfer panel, `/admin/deposits/audit` |

---

## 16. Deposit Transfers

| Field | Detail |
|-------|--------|
| **Status** | **VERIFIED** (admin-only path) · **NEEDS TEST** (E2E transfer + new booking checkout) |

### Trigger

| Actor | Trigger | Entry |
|-------|---------|-------|
| Admin | Transfer prior booking deposit to new booking | `TransferOldDepositPanel` on `/admin/deposits/[bookingId]` |
| Admin | Explicit credit on walk-in/assign | `depositCreditAppliedPaise` param on assign/walk-in |

**Not a trigger:** Customer booking checkout — auto cross-booking credit was removed (deposit isolation fix).

### Entry screens

| Surface | Route |
|---------|-------|
| Admin deposit detail | `/admin/deposits/[bookingId]` — Transfer Old Deposit panel |
| Admin booking detail | `/admin/bookings/[bookingId]` — deposit summary (read) |
| Customer pay page | `/booking/[bookingCode]/pay` — shows prior deposits **informationally only** on payment review cards |

### Routes & actions

- `transferOldDepositAction` — `app/(admin)/admin/deposits/deposit-wallet-actions.ts`
- `applyDepositCreditToBooking()` — called from `recordPaymentSuccess()` when snapshot has `adminTransferred`

### Services called

| Service | File | Role |
|---------|------|------|
| `transferOldDepositAdmin()` | `src/services/depositCredit.ts` | Deduct source booking ledger + collect on target + stamp snapshot |
| `applyDepositDeduction()` | `src/services/depositSettlement.ts` | Source booking deduction entry |
| `recordDepositCollected()` | `src/services/deposits.ts` | Target booking collection entry |
| `computeNewBookingCheckoutTotals()` | `src/lib/billing/bookingCheckoutTotals.ts` | Credit applied only if `depositCredit.adminTransferred` |

### Database tables touched

`deposit_ledger`, `bookings.pricing_snapshot`, `audit_log`, optional `payments` (if bundled in checkout)

### Dependencies

- Source booking must have refundable balance (`getDepositSummaryForBooking`)
- Target booking typically `pending_payment` or awaiting deposit
- Requires admin `deposits:write`

### Impacts

| Domain | Impact |
|--------|--------|
| **Financial** | Moves liability between bookings; no revenue recognition |
| **Invoice** | May reduce deposit-due on target booking |
| **Revenue** | None |
| **Occupancy** | None |
| **Resident** | Lower checkout amount on target after transfer |
| **Admin** | Audit log + deposit detail panels on both bookings |

### SSOT

Cross-booking deposit credit is valid **only** when `pricing_snapshot.depositCredit.adminTransferred === true`. Ledger entries on both bookings are authoritative for money movement.

---

## 17. Requests

| Field | Detail |
|-------|--------|
| **Status** | **VERIFIED** · **NEEDS TEST** (dedup vs checkout settlement) · **DUPLICATE** with Checkout Settlement for deposit refunds |

### Request types

| Type | Resident submit | Admin review | Canonical alternative |
|------|-----------------|--------------|---------------------|
| `deposit_refund` | Resident hub / vacating flow | `/admin/requests` | **Checkout settlement** (preferred) |
| `stay_extension` | Extension request UI | `/admin/requests` | `/admin/extensions` + extension pay flow |

### Entry screens

| Actor | Screen | Route |
|-------|--------|-------|
| Resident | Open requests list | `/account/profile?section=resident` (home tab) |
| Resident | Deposit refund submit | Vacating / wallet CTAs → `submitDepositRefundRequest()` |
| Admin | Request queue | `/admin/requests` |
| Admin | Operations dashboard | `/admin/operations/residents` — request counts |
| Admin | Action center | `/admin/actions` — synced `action_items` |

### Server actions

- `reviewResidentRequestAction` — `app/(admin)/admin/requests/actions.ts`
- Customer submit — `app/(customer)/account/resident/request-actions.ts`, vacating actions

### Services called

| Service | File |
|---------|------|
| `submitDepositRefundRequest()`, `adminReviewResidentRequest()` | `src/services/residentRequests.ts` |
| `syncResidentRequestActionItems()` | `src/services/residentRequestActions.ts` |
| `settleDepositWithDeductions()` | `src/services/depositSettlement.ts` (on complete) |
| `calculateRefundElectricityForBooking()` | `src/services/refundElectricity.ts` |
| Dedup | `src/services/adminRefundQueue.ts` |

### Database tables touched

`resident_requests`, `action_items`, `deposit_ledger`, `deposit_settlements`, `checkout_settlements`, `audit_log`

### Dependencies

- Deposit refund requests gated by `getDepositRefundEligibility()` (vacating state)
- `adminRefundQueue` skips legacy requests when checkout settlement exists

### Impacts

| Domain | Impact |
|--------|--------|
| **Financial** | Legacy complete → `settleDepositWithDeductions()` |
| **Invoice** | Electricity deductions may create adjustment invoices |
| **Revenue** | Deduction charges may affect revenue categories |
| **Occupancy** | Legacy path may not finalize vacating occupancy — checkout is canonical |
| **Resident** | Request status on home tab |
| **Admin** | Sidebar badges via `action_items` sync |

### SSOT

`resident_requests` for request **state**; deposit money still `deposit_ledger`. For move-out refunds, **`checkout_settlements` workflow is canonical** — legacy requests are fallback only.

---

## 18. Notifications

| Field | Detail |
|-------|--------|
| **Status** | **VERIFIED** (email log + admin inbox) · **UNKNOWN** (delivery rates in prod) · **NEEDS TEST** (cron reminder batches) |

### Channels

| Channel | SSOT | UI |
|---------|------|-----|
| Email | `email_delivery_log` | Resident `NotificationCenterPanel` (`?tab=notifications`) |
| Admin in-app | `admin_notifications` + `action_items` | `AdminNotificationCenter`, `/admin/notifications` |
| Timeline | Derived events | Admin resident timeline |

### Entry screens

| Actor | Route |
|-------|-------|
| Resident | `/account/profile?section=resident&tab=notifications` |
| Admin | `/admin/notifications` |
| Admin | Header bell → `/api/admin/notifications` |

### Trigger hooks (representative)

| Event | Hook |
|-------|------|
| Booking confirmed | `notifyBookingConfirmed` — `src/lib/email/notifications.ts` |
| Payment receipt | `notifyPaymentReceipt` |
| Rent reminder | Cron automation → `notifyRentReminder` |
| Electricity reminder | `electricityBilling.ts` |
| Vacating update | `notifyVacatingUpdate` |
| OTP | `notifyVerificationCode` — `src/lib/auth/otp.ts` |
| Action items sync | `refreshAdminNotificationsFromActionItems()` |

### Services called

| Service | File |
|---------|------|
| `sendEmail()`, `sendEmailAsync()` | `src/lib/email/send.ts` |
| Notification templates | `src/lib/email/notifications.ts` |
| `listCustomerEmailNotifications()` | `src/db/queries/customerNotifications.ts` |
| Admin API | `app/api/admin/notifications/route.ts` |
| Health audit | `src/services/systemHealthAudit.ts` — notification integrity |

### Database tables touched

`email_delivery_log`, `admin_notifications`, `action_items` (indirect)

### Impacts

| Domain | Impact |
|--------|--------|
| **Financial** | None (informational) |
| **Invoice** | Invoice share emails reference `financial_invoices` links |
| **Revenue** | Reminders drive payment collection indirectly |
| **Occupancy** | None |
| **Resident** | Email history tab; no push/SMS in codebase |
| **Admin** | Unread badges; stale href detection in health audit |

### SSOT

Delivered email record: `email_delivery_log`. Admin actionable alerts: `action_items` → `admin_notifications`. Notifications do **not** drive financial state — they reflect it.

---

## System verification audit

### Duplicate workflows

| Duplicate | Paths | Risk | Recommendation for verification |
|-----------|-------|------|--------------------------------|
| Deposit refund | Checkout settlement vs `/admin/requests` | Double refund if both completed | Verify dedup in `adminRefundQueue`; close legacy path after checkout verified |
| Booking payment confirm | QR proof → `recordPaymentSuccess` vs `recordOfflinePaymentAction` | Missing deposit ledger on offline | **Fix or disable offline path** before closing Booking Payment topic |
| Revenue views | `/admin/revenue`, `/admin/overview/revenue`, `/admin/collections` | Same KPIs, different filters | Pick one SSOT screen for manual verification |
| Resident admin profile | `/admin/residents/[id]`, `/admin/operations/pg/.../resident/...`, `/admin/revenue/pg/.../resident/...`, `/admin/collections/pg/.../resident/...` | Same resident data, 4 entry URLs | Document which panel is canonical for each action |
| KYC review | `/admin/kyc` vs `/admin/residents/kyc` | Two admin KYC routes | Confirm redirect/canonical route |
| Electricity admin | `/admin/electricity` redirects to `/admin/collections?tab=electricity` | Alias only | Low risk |
| Invoice detail | `/account/resident/invoices/[id]` redirects to `/resident/invoices/[ref]` | Alias | Low risk |

### Dead code / unused routes (static audit)

| Item | Evidence | Severity |
|------|----------|----------|
| `/admin/payments` | Redirects to payment-reviews | Alias — not dead |
| `/admin/electricity` | Redirect to collections tab | Alias |
| `/account/wallet` | Redirect to resident hub wallet tab | Alias |
| `/account/kyc` | Redirect to profile identity section | Alias |
| `/booking/[code]/extend` | Redirect with `extend_removed=1` | **Likely dead feature surface** |
| `/admin/overview/analytics` | Redirect to `/admin/analytics` | Alias |
| Razorpay on booking pay page | Webhook exists; UI QR-only | **Partially dead integration** |
| `completeVacatingRequest()` | Blocked when checkout exists | Intentionally deprecated path |

### Screens showing same data from different places

| Data | Surfaces | SSOT loader |
|------|----------|-------------|
| Resident outstanding | Resident hub payments tab, wallet tab, admin resident profile, operations dashboard, revenue command center | `getResidentFinancialSummary()` |
| Deposit balance | Admin deposits detail, resident wallet, payment review prior-deposit info, checkout settlement | `getDepositSummaryForBooking()` |
| Pending proofs | Payment reviews, revenue billing tab, action center | `listPendingPaymentReviews()` |
| Rent due | Revenue rent-due, resident payments hub, action items | `rent_invoices` + RFE |
| Invoice document | Admin invoice detail, shared `/resident/invoices/[ref]`, WhatsApp link | `invoiceDocumentModel.ts` |

### Financial calculation inconsistency risks

| # | Risk | Where | Mitigation to verify |
|---|------|-------|---------------------|
| F1 | Offline payment bypasses ledger | `recordOfflinePaymentAction` | Route all admin confirms through `recordPaymentSuccess` |
| F2 | Deposit ledger error swallowed | `bookingLifecycle.ts` catch on `recordDepositCollected` | Confirm booking should not confirm if ledger fails |
| F3 | Unified invoice async sync | `syncRentInvoiceToUnified` fire-and-forget on generate | Reconcile `rent_invoices` vs `financial_invoices` after batch |
| F4 | Stale `pricing_snapshot` vs live bed price | Booking uses snapshot; repricing admin tools | Verify snapshot at payment time matches quote |
| F5 | Cross-booking deposit without admin transfer | Removed at customer checkout — verify no other auto-credit paths | Grep + E2E new booking after prior deposit |
| F6 | Legacy refund + checkout both open | `adminRefundQueue` dedup | E2E vacating → checkout only |
| F7 | Partial deposit vs full confirm | `approvePartialQrPaymentAction` vs full approve | Verify occupancy gates match `deposit_collection_status` |
| F8 | Electricity split rounding | `splitElectricity()` per occupant | Multi-occupant room manual check |
| F9 | Prior outstanding allocation | `bookingPriorOutstanding.ts` on confirm only | Offline path skips — see F1 |
| F10 | Invoice refund vs deposit refund | `refundUnifiedInvoice` vs `settleDepositRefund` | Ensure same booking cannot double-refund |

---

## Cross-workflow dependency matrix

| From → To | Link |
|-----------|------|
| Booking → Booking Payment | `pending_payment` until `recordPaymentSuccess` |
| Booking Payment → Deposit | `recordDepositCollected` on confirm |
| Booking Payment → Occupancy | `hold` → `active` |
| Confirmed → Rent Billing | Cron/admin `generateRentInvoicesForMonth` |
| Electricity bill → Electricity invoices | `createElectricityBill` fan-out |
| Rent/Elec pay → Unified invoice | `sync*ToUnified` |
| Proof approve → All payment types | `paymentProofQueue` → kind-specific `record*Success` |
| Vacating approve → Checkout | `createCheckoutSettlementFromVacating` |
| Checkout approve → Refund | `settleDepositRefund` + occupancy finalize |
| Deposit transfer | Admin only; never at customer checkout |

---

## Known issues summary

| # | Workflow | Status | Issue |
|---|----------|--------|-------|
| 1 | Booking Payment | **BROKEN** | `recordOfflinePaymentAction` bypasses `recordPaymentSuccess` — skips deposit ledger, prior outstanding, partial deposit, PS4 |
| 2 | Booking Payment | **NEEDS TEST** | Razorpay infrastructure exists; customer pay page is QR-only |
| 3 | Booking Payment | **NEEDS TEST** | Deposit ledger errors swallowed on confirm — booking still confirms |
| 4 | Rent Billing | **NEEDS TEST** | Unified invoice sync fire-and-forget on generate |
| 5 | All core flows | **NEEDS TEST** | No automated DB integration tests for `createBooking`, `recordPaymentSuccess`, `generateRentInvoicesForMonth` — manual scripts in `/scripts/verify-*.ts` |
| 6 | Invoices | **MISSING NAV** | Confirmed residents reach shared invoices via external link only, not hub UI (documented in H10 regression report) |
| 7 | Payment receipts | **MISSING NAV** | Receipt route exists; hub paid history not linked |

---

## Test coverage reference

| Area | Unit tests (examples) | Integration / scripts |
|------|----------------------|------------------------|
| Booking checkout totals | `tests/unit/bookingCheckoutTotals.test.ts` | `scripts/verify-booking.ts` |
| Booking approval phases | `tests/unit/bookingApproval.test.ts` | — |
| Deposit ledger / settlement | `tests/unit/depositSsot.test.ts`, `depositSettlement.test.ts` | `scripts/verify-deposit-ledger.ts` |
| Checkout settlement | `tests/unit/checkoutSettlementDeductions.test.ts`, `vacatingCheckout.test.ts` | — |
| Invoices | `tests/unit/invoiceDocumentModel.test.ts`, `invoiceStateMachine.test.ts` | `scripts/verify-invoice-command-center.ts` |
| Razorpay | `tests/unit/razorpayCheckout.test.ts` | `scripts/verify-razorpay-production.ts` |
| Rent billing | `tests/unit/billing.test.ts`, `financialReconciliation.test.ts` | `scripts/verify-rent-billing.ts` |
| KYC | `tests/unit/kycValidation.test.ts`, `kycUpload.test.ts` | — |
| Critical journeys | `tests/integration/criticalJourneys.test.ts` (static source inspection) | — |

---

## Admin screen index (by workflow)

| Workflow | Primary admin routes |
|----------|---------------------|
| Booking | `/admin/bookings`, `/admin/bookings/new`, `/admin/bookings/[id]`, `/admin/quick-actions` |
| Booking Payment | `/admin/operations/payment-reviews`, `/admin/revenue/billing` |
| Deposit | `/admin/deposits`, `/admin/deposits/[bookingId]`, `/admin/deposits/add`, `/admin/deposits/advance` |
| Rent Billing | `/admin/revenue`, `/admin/revenue/billing`, `/admin/rent` |
| Electricity | `/admin/electricity`, `/admin/electricity/new` |
| Payment Proof | `/admin/operations/payment-reviews` |
| Revenue Creation | `/admin/revenue/billing` (generate tab) |
| KYC | `/admin/residents/kyc` |
| Bed Assignment | `/admin/beds`, `/admin/pgs/[pgId]/map` |
| Resident Lifecycle | `/admin/residents`, `/admin/residents/[customerId]` |
| Vacating | `/admin/vacating` |
| Checkout Settlement | `/admin/checkout-settlements` |
| Refunds | `/admin/checkout-settlements`, `/admin/deposits/[bookingId]`, `/admin/invoices/[id]` |
| Invoices | `/admin/invoices`, `/admin/invoices/[invoiceId]` |
| Wallet / Ledger | `/admin/deposits/[bookingId]`, `/admin/deposits/audit` |

---

## Related documentation

- [`SYSTEM_GRAPH.md`](./SYSTEM_GRAPH.md) — Mermaid workflow connection diagrams
- [`MASTER_TEST_MATRIX.md`](./MASTER_TEST_MATRIX.md) — PASS/FAIL/NOT TESTED verification matrix
- `docs/SYSTEM/WORKFLOWS.md` — narrative workflow docs
- `docs/h10-regression-report.md` — resident nav regression audit
- `docs/Billing.md`, `docs/Deposits.md`, `docs/Electricity.md`, `docs/Invoices.md`
- `docs/Bed Assignment.md`
- `RAZORPAY_E2E_REPORT.md` — Razorpay integration status

---

*This document is a static verification artifact. Re-run the audit after major service changes. Runtime verification requires executing `/scripts/verify-*.ts` against a staging database and manual E2E on payment proof + checkout settlement flows.*

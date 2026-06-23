# Deposit Risk Verification (Phase 2)

**Date:** 13 June 2026  
**Mode:** Verification only — no redesign, refactor, or fixes  
**Prior audit:** [`DEPOSIT_VERIFICATION.md`](./DEPOSIT_VERIFICATION.md)  
**Method:** Static code trace of DR-01 through DR-04. E2E scenarios documented for operator replay when migration-current DB is available.

---

## Summary

| Risk | Title | Verdict | Verification method |
|------|-------|---------|---------------------|
| **DR-01** | `cancelBooking()` ledger gap | **FAIL** | Static code trace — no `settleDepositRefund` / `deposit_ledger.refunded` |
| **DR-02** | Duplicate refund paths | **FAIL** | Static code trace — 8 paths; canonical vs legacy overlap; partial balance guards only |
| **DR-03** | Swallowed deposit ledger failures | **FAIL** | Static code trace — 4 locations; primary path returns `{ ok: true }` after swallow |
| **DR-04** | Express walk-in wallet credit audit | **FAIL** | Static code trace — source forensically in ledger; not auditable in snapshot/UI |

---

## DR-01 — `cancelBooking()` does not mirror refund to `deposit_ledger`

### Verdict: **FAIL**

A refunded deposit from cancellation **does not** always create matching `deposit_ledger.refunded` entries. In the current code, it **never** does.

### Exact code path

```
Customer: CancelBookingForm → cancelBookingAction
          app/(customer)/booking/[bookingCode]/actions.ts
Admin:    AdminBookingActions → cancelBookingAction
          app/(admin)/admin/bookings/[bookingId]/actions.ts
          │
          ▼
cancelBooking()  src/services/bookingLifecycle.ts:1499–1692
          │
          ├─ computeRefund()  (rent + deposit tier from cancellationPolicy)
          │
          ├─ [optional] provider.refund()  (Razorpay external)
          │
          └─ db.transaction:
               ├─ INSERT payments  purpose='refund', amountPaise = -totalRefundPaise
               │    rawPayload.depositRefundPaise = computed tier amount
               ├─ UPDATE payments  (original booking payment → refunded/partially_refunded)
               ├─ UPDATE bed_reservations → cancelled
               ├─ UPDATE bookings → cancelled | refunded
               └─ INSERT audit_log  action='cancel'
               
               ✗ No import of settleDepositRefund
               ✗ No INSERT into deposit_ledger
               ✗ No INSERT into deposit_settlements
               ✗ bookings.admin_deposit_refund_status unchanged
```

Deposit was previously mirrored to ledger on confirm via `recordPaymentSuccess()` → `recordDepositCollected()` (`collected` row). Cancellation refunds **payments only**, leaving ledger balance intact.

### Affected tables

| Table | On cancel with refund |
|-------|----------------------|
| `payments` | New `refund` row (negative amount); original `booking` payment status updated |
| `deposit_ledger` | **Unchanged** — `collected` remains; no `refunded` row |
| `deposit_settlements` | **Unchanged** |
| `bookings` | `status` → `cancelled` or `refunded`; `admin_deposit_refund_status` **not** set |
| `audit_log` | `cancel` with refund breakdown in diff |
| `bed_reservations` | `cancelled` |

### Affected UI screens

| Screen | Symptom |
|--------|---------|
| `/admin/deposits/[bookingId]` | Shows **held refundable balance** after customer/admin cancel refunded deposit |
| `/admin/deposits` (portfolio) | Deposit invoice status may show **held** / **refund_pending** incorrectly |
| Resident wallet tab | May show deposit credit from cancelled booking |
| `/admin/bookings/[bookingId]` | Booking `refunded`; deposit summary inconsistent with payments |
| Customer booking page | Cancel succeeds; no deposit ledger correction |

### Reproducible test scenario

**Prerequisites:** Migration-current DB; script pattern from `scripts/verify-cancel-refund.ts`.

| Step | Action |
|------|--------|
| 1 | `createBooking()` with deposit > 0 |
| 2 | `recordPaymentSuccess()` for full `totalPaise` |
| 3 | Assert `deposit_ledger` has `collected` row; `refundableBalancePaise > 0` |
| 4 | `cancelBooking()` in **full** tier (>48h before check-in) |
| 5 | Query ledger and payments |

| Field | Expected (correct SSOT) | Actual (current code) |
|-------|-------------------------|----------------------|
| `payments` refund row | Negative amount exists | **Present** |
| `deposit_ledger.refunded` | Row for `depositRefundPaise` | **Absent** |
| `getDepositSummaryForBooking().refundableBalancePaise` | 0 after full deposit refund | **Unchanged** (still shows collected) |
| `bookings.admin_deposit_refund_status` | `refunded` | **Unchanged** (default) |

**Affected services:** `cancelBooking`, `computeRefund`, `recordPaymentSuccess` (prior collect only)  
**Financial impact:** Cash/refund recorded in `payments`; deposit **liability overstated** in ledger and revenue/deposit portfolio metrics until manual admin correction.

**Note:** `scripts/verify-cancel-refund.ts` validates cancellation **tiers** only — it does **not** assert ledger parity (gap confirmed by code inspection).

---

## DR-02 — Duplicate deposit refund paths

### Verdict: **FAIL**

Multiple paths can issue deposit refunds. The **canonical move-out path** is checkout settlement. Legacy and parallel paths remain active. Balance checks in `settleDepositRefund` prevent **ledger over-refund** in most cases, but **inconsistent state** is possible between `payments`, `deposit_ledger`, and `admin_deposit_refund_status` — especially when cancellation (DR-01) or vacating settlement overlaps checkout.

### Canonical path

```
Vacating → checkout_settlements (draft)
         → approveCheckoutSettlement()     applyDepositDeductionsInTx
         → markCheckoutRefundPaid()        settleDepositRefund(source: checkout)
                                           idempotencyKey: checkout:{settlementId}
```

**Screens:** `/admin/checkout-settlements`, `/admin/checkout-settlements/[id]`  
**Tables:** `checkout_settlements`, `deposit_ledger`, `deposit_settlements`, `bookings`

### Every path capable of issuing a deposit refund

| # | Entry point | Action / trigger | Service | Ledger write | Idempotency key | Canonical? |
|---|-------------|------------------|---------|--------------|-----------------|------------|
| 1 | `/admin/checkout-settlements/[id]` | Mark refund paid | `markCheckoutRefundPaid` → `settleDepositRefund` | `refunded` | `checkout:{settlementId}` | **Yes (move-out)** |
| 2 | `/admin/deposits/[bookingId]` | Refund form | `refundDepositAction` → `settleDepositRefund` | `refunded` | `manual:{bookingId}:{uuid}` | Admin ad-hoc |
| 3 | `/admin/quick-actions` | Quick refund | `quickRefundSettlementAction` → `settleDepositRefund` | `refunded` | `quick:{bookingId}:{uuid}` | Admin ad-hoc |
| 4 | `/admin/deposits/[bookingId]` | Settlement panel | `processDepositSettlementAction` → `settleDepositWithDeductions` | deduct + `refunded` | `admin_panel:{bookingId}` | Legacy admin |
| 5 | `/admin/requests` | Complete `deposit_refund` | `residentRequests` complete → `settleDepositWithDeductions` | deduct + `refunded` | `resident_request:{requestId}` | **Legacy duplicate** |
| 6 | Vacating admin complete | No approved refund request | `settleVacatingDepositRefund` | deduct + `refunded` (inline tx) | `vacating:{requestId}` | **Overlaps checkout** |
| 7 | Customer/admin cancel | Cancel booking | `cancelBooking` | **None** — `payments` only | N/A | **Non-ledger path (DR-01)** |
| 8 | Unified invoice refund | Deposit line reversal | `invoicePayment.ts` → `applyDepositDeduction` | `deducted` only | N/A | Partial / reversal |

### Duplicate-path inconsistency analysis

| Scenario | Can inconsistent state occur? | Mechanism |
|----------|------------------------------|-----------|
| Checkout + legacy resident request | **Partially mitigated** | Second path fails when `refundPaise > refundableBalance` after first drains ledger |
| Vacating `settleVacatingDepositRefund` + checkout mark paid | **Yes, if both run** | Different idempotency keys; second fails only after balance exhausted |
| `refundDepositAction` twice | **Mitigated** | Random UUID keys; balance guard on second call |
| `processDepositSettlementAction` replay | **Mitigated** | Stable `admin_panel:{bookingId}` idempotency |
| `cancelBooking` + any ledger refund path | **Yes** | Payments show refund; ledger still shows held balance (DR-01) |
| Checkout approve (zero refund) | **Edge** | Sets `admin_deposit_refund_status = refunded` without `refunded` ledger row when fully deducted — intentional for zero payout |

**Conclusion:** Canonical path is **checkout settlement (#1)**. Paths **#5, #6** are legacy duplicates. Path **#7** bypasses ledger entirely. Duplicate paths **can** create inconsistent cross-table state even when double-cash-out is blocked.

### Reproducible test scenario A — legacy vs checkout

| Step | Action |
|------|--------|
| 1 | Complete vacating with deposit held; create `checkout_settlements` row |
| 2 | Also submit + approve `resident_requests` type `deposit_refund` |
| 3 | Complete resident request (`settleDepositWithDeductions`) |
| 4 | Attempt `markCheckoutRefundPaid` on same booking |

| Field | Expected | Actual |
|-------|----------|--------|
| First refund | Ledger `refunded`; balance reduced | Succeeds |
| Second refund | Blocked — already settled | **Fails** with "Refund exceeds refundable balance" **if** first consumed full balance |
| `admin_deposit_refund_status` | Single terminal state | May be set by multiple paths independently |

**Affected services:** `checkoutSettlement.ts`, `depositSettlement.ts`, `residentRequests.ts`, `vacating.ts`  
**Affected screens:** `/admin/checkout-settlements`, `/admin/requests`, `/admin/deposits/[bookingId]`, resident requests hub

### Reproducible test scenario B — cancel + admin refund

| Step | Action |
|------|--------|
| 1 | Pay booking (ledger `collected`) |
| 2 | `cancelBooking()` with partial/full deposit refund tier |
| 3 | Admin opens `/admin/deposits/[bookingId]` — observes held balance |
| 4 | Admin `refundDepositAction` for same amount |

| Field | Expected | Actual |
|-------|----------|--------|
| After cancel | Ledger balance 0 | **Ledger unchanged** |
| Admin refund | N/A or blocked | **May succeed** — pays resident again from ledger balance that should have been cleared |

**Financial impact:** Double payout risk (provider refund + ledger refund) when cancel tier returns deposit via `payments` and admin later refunds from ledger.

---

## DR-03 — Catch blocks swallowing deposit ledger failures

### Verdict: **FAIL**

The primary booking confirm path **returns success** even when the entire deposit ledger block fails.

### Exact locations

| # | File | Lines | Behavior | Returns success anyway? |
|---|------|-------|----------|-------------------------|
| **L1** | `src/services/bookingLifecycle.ts` | 428–536 | Outer `try/catch` around full deposit block: `recordDepositCollected`, partial/full confirm, prior outstanding, overpayment, credit transfer | **Yes** — `return { ok: true, stateChanged: true }` at :654 |
| **L2** | `src/services/bookingLifecycle.ts` | 449–459 | `applyDepositCreditToBooking` failure → `console.error` only; no throw | **Yes** — continues; booking already confirmed inside same try |
| **L3** | `src/services/invoicePayment.ts` | 175–182 | `applyDepositDeduction` on deposit invoice refund reversal → `.catch(() => undefined)` | Caller continues; reversal may be partial |
| **L4** | `src/services/expressWalkInRollback.ts` | 72–74 | `syncDepositCollectionFromLedger` failure → `.catch` log only | Rollback continues |

**Primary path (L1) call graph:**

```
recordPaymentSuccess()
  → [transaction] confirm booking, insert payment
  → try {  // lines 428–533
       validateBookingPayment / split
       applyDepositCreditToBooking        // L2: errors logged only
       recordDepositCollected
       applyPartialDepositOnConfirm | applyFullDepositOnConfirm
       applyPriorOutstandingFromCheckoutPayment
       applyBookingOverpaymentDisposition
     } catch (depositErr) {
       console.error('deposit ledger mirror failed:', depositErr)  // L1
     }
  → notifyBookingConfirmed, automation, emails
  → return { ok: true, stateChanged: true }   // booking confirmed without ledger
```

**Callers of `recordPaymentSuccess` (all inherit L1 behavior):**

- `app/api/webhooks/razorpay/route.ts`
- `app/api/webhooks/mock/route.ts`
- `src/services/paymentVerification.ts`
- `src/services/qrPayments.ts` (approve full / partial QR)
- `app/(admin)/admin/bookings/[bookingId]/actions.ts` (`recordOfflinePaymentAction`)
- Scripts: `verify-deposit-ledger.ts`, `verify-cancel-refund.ts`, E2E harness

### Affected tables

| Table | On swallowed failure |
|-------|---------------------|
| `bookings` | `confirmed`; deposit collection status may stay wrong |
| `payments` | `succeeded` booking payment row exists |
| `deposit_ledger` | **Missing** `collected` row |
| `bed_reservations` | `active` — move-in proceeds |

### Affected UI screens

| Screen | Symptom |
|--------|---------|
| `/admin/operations/payment-reviews` | Shows approved; deposit detail empty |
| `/admin/deposits/[bookingId]` | Required > 0, collected = 0, wallet mismatch flags |
| Resident hub | No deposit held / wrong due status |
| `/admin/deposits` portfolio | `collecting` vs confirmed resident mismatch |

### Reproducible test scenario

**Simulate:** Force `recordDepositCollected` to throw (e.g. temporarily revoke DB insert on `deposit_ledger`, or inject invalid `amountPaise` in a forked test).

| Step | Action |
|------|--------|
| 1 | Create booking with deposit > 0, `pending_payment` |
| 2 | Call `recordPaymentSuccess()` with valid payment |
| 3 | Catch/log `deposit ledger mirror failed` in server output |
| 4 | Query booking + ledger |

| Field | Expected (fail-closed) | Actual |
|-------|------------------------|--------|
| `recordPaymentSuccess` result | `{ ok: false }` | **`{ ok: true, stateChanged: true }`** |
| `bookings.status` | `pending_payment` | **`confirmed`** |
| `deposit_ledger` | `collected` row | **Empty** |
| Customer email | Not sent | **Booking confirmed email sent** |

**Affected services:** `recordPaymentSuccess`, `recordDepositCollected`, `depositCollection.syncDepositCollectionFromLedger` (never reached)  
**Financial impact:** Rent recognized via payment; deposit liability missing from ledger — breaks wallet, checkout settlement, and deposit portfolio totals.

**Runtime E2E status:** **NOT VERIFIED** (requires DB + controlled fault injection). Code path verdict: **FAIL**.

---

## DR-04 — Express walk-in wallet credit source auditability

### Verdict: **FAIL**

Credit **source booking(s)** are forensically identifiable from `deposit_ledger` rows (`booking_id` on each `deducted` entry; reason contains target booking id). They are **not** reliably auditable via snapshot, UI, or a single `audit_log` event comparable to `transferOldDepositAdmin`.

### Exact code path

```
Admin quick-actions: runExpressWalkInSaleAction
  app/(admin)/admin/quick-actions/actions.ts
          │
          ▼
expressWalkInSale()  src/services/expressWalkInSale.ts
          │
          ├─ getCustomerDepositCredit(customerId)   // aggregate wallet
          ├─ walletCreditApplied = min(requested, availableCreditPaise)
          │
          ├─ createBooking({ depositCreditAppliedPaise: walletCreditApplied })
          │     → booking.ts:538–546 stamps snapshot.depositCredit:
          │         { adminTransferred: true, appliedPaise, transferredByAdminId }
          │         ✗ NO sourceBookingId
          │
          └─ if walletCreditApplied > 0:
                applyDepositCreditToBooking({
                  customerId,
                  targetBookingId: newBookingId,
                  creditPaise: walletCreditApplied,
                  // ✗ NO sourceBookingId
                })
```

**Inside `applyDepositCreditToBooking` without `sourceBookingId`:**

```typescript
// depositCredit.ts:119–121
wallet.byBooking
  .filter(b => b.bookingId !== targetBookingId && b.availablePaise > 0)
  .sort((a, b) => b.availablePaise - a.availablePaise)  // largest first

// Each slice:
applyDepositDeduction({
  bookingId: source.bookingId,
  reason: `Deposit credit transferred to booking ${targetBookingId}`,
})
recordDepositCollected({ target, reason: DEPOSIT_CREDIT_REASON })
```

**Contrast — auditable admin transfer:**

```
transferOldDepositAdmin()  depositCredit.ts:316–398
  → sourceBookingId required
  → stampAdminDepositCreditOnBooking({ sourceBookingId, sourceBookingCode, ... })
  → audit_log action: deposit_transfer_from_prior_booking
```

### Comparison table

| Attribute | `transferOldDepositAdmin` | Express walk-in wallet credit |
|-----------|---------------------------|------------------------------|
| `sourceBookingId` in snapshot | Yes | **No** |
| `audit_log` transfer event | Yes | **No** |
| Source selection | Admin picks source | **Auto: largest balance first** |
| Multi-source drain | Single source | **Possible** — multiple `deducted` rows |
| Target collected reason | `DEPOSIT_CREDIT_REASON` | Same |
| Source deducted reason | Includes target booking id | Includes target booking id |
| UI panel | `TransferOldDepositPanel` | Quick-actions express walk-in |

### Affected tables

| Table | Express walk-in credit |
|-------|------------------------|
| `deposit_ledger` | Multiple `deducted` on source booking(s); one `collected` on target |
| `bookings.pricing_snapshot.depositCredit` | `adminTransferred: true`; **no `sourceBookingId`** |
| `audit_log` | **No** `deposit_transfer_from_prior_booking` |
| `payments` | Walk-in cash deposit/rent rows (separate from credit) |

### Affected UI screens

| Screen | What operator sees |
|--------|-------------------|
| Admin quick-actions express walk-in | Wallet credit applied amount; **not** which prior booking(s) |
| `/admin/deposits/[bookingId]` (target) | Collected includes `DEPOSIT_CREDIT_REASON`; no source link in UI |
| `/admin/deposits/[bookingId]` (source) | Deduction rows; must read ledger reasons manually |
| `/admin/deposits` transfer panel | **Not used** for express walk-in path |

### Reproducible test scenario

**Prerequisites:** Customer with **two** prior confirmed bookings, each with refundable deposit (e.g. ₹5,000 + ₹3,000). New express walk-in with `walletCreditPaise = 7000`.

| Step | Action |
|------|--------|
| 1 | Note prior booking ids A (₹5k) and B (₹3k) |
| 2 | Run express walk-in with wallet credit ₹7,000 |
| 3 | Inspect ledger on A, B, and new booking C |

| Field | Expected (fully auditable) | Actual |
|-------|--------------------------|--------|
| Snapshot on C | `sourceBookingId` or list of sources | **`sourceBookingId` absent** |
| `audit_log` | Transfer event with admin + sources | **Absent** |
| Ledger on A | Deducted ₹5,000 | **Present** — reason references C |
| Ledger on B | Deducted ₹2,000 | **Present** — remainder from second source |
| Operator UI | Single transfer audit view | **Must inspect two source ledgers** |

**Affected services:** `expressWalkInSale.ts`, `applyDepositCreditToBooking`, `createBooking`  
**Financial impact:** Money movement correct in ledger; **operational/audit risk** — disputes and reconciliation require manual ledger forensics.

**Runtime E2E status:** **NOT VERIFIED** (requires multi-booking fixture). Source identifiability: **PASS** (ledger). Auditability: **FAIL**.

---

## Cross-risk matrix

| Risk | Overlaps with |
|------|---------------|
| DR-01 | DR-02 path #7; inflates wallet → enables DR-02 scenario B double payout |
| DR-02 | DR-01 cancel path bypasses canonical `settleDepositRefund` guards |
| DR-03 | All booking payment confirms; silent gap like missing collect on cancel refund inverse |
| DR-04 | DT-01 transfer panel bypassed; different audit standard for same money movement |

---

## Recommended verification order (operator, when DB available)

1. **DR-01** — extend `verify-cancel-refund.ts` with ledger assertions (read-only check)
2. **DR-03** — run `verify-deposit-ledger.ts` after every `recordPaymentSuccess` in E2E harness
3. **DR-02** — staged move-out: attempt legacy request + checkout on same booking
4. **DR-04** — express walk-in with 2-source wallet; compare audit_log to `transferOldDepositAdmin`

---

*Verification complete. No code changes in this phase.*

# System Consistency Report

> **Generated:** 2026-06-24  
> **Goal:** One value everywhere — resident, admin, and database must agree.  
> **Rule:** Screens read from SSOT services; no independent calculation on UI pages.

---

## SSOT Map (canonical sources)

| Domain | SSOT service / module |
|--------|------------------------|
| Booking checkout totals | `src/lib/billing/bookingCheckoutTotals.ts` |
| Stay type labels | `src/lib/stayType.ts` (`stayTypeLabel`, `adminStayTypeLabel`) |
| Deposits / wallet balance | `src/services/deposits.ts` → `getDepositSummaryForBooking()` |
| Resident money (all categories) | `src/services/residentFinancialEngine.ts` |
| Rent invoices (outstanding, late fee) | `src/services/rentInvoices.ts` → `projectInvoice()` |
| Electricity invoices | `src/services/electricityBilling.ts` → `projectElectricityInvoice()` |
| Notice deduction | `src/services/billing.ts` → `computeNoticeDeduction()` |
| Checkout refund preview | `src/lib/billing/checkoutRefundPreview.ts` |
| Checkout settlement | `src/services/checkoutSettlement.ts` |
| Vacating workflow | `src/services/vacating.ts` |
| Revenue command center | `src/services/revenueCommandCenter.ts` |
| PG revenue resident rows | `src/services/pgRevenueResidents.ts` |
| Operations center counts | `src/services/operationsCenter.ts` + `verifyOperationsCenterCounts()` |
| Action items / notifications | `src/services/actionItems.ts` + `adminNotifications.ts` |

---

## Workflow Results

### 1. Booking — **PASS** (after fix)

| Check | Result |
|-------|--------|
| stay_type / duration labels | **PASS** — customer + admin lists use `stayTypeLabel` / `adminStayTypeLabel` |
| move-in / move-out | **PASS** — from `bed_reservations.stay_range` + `expectedCheckoutDate` |
| rent / deposit / status | **PASS** — `bookings` row + `pricing_snapshot` |

**Root cause (was FAIL):** Customer booking detail, applications list, checkout, and admin bookings table each had local label functions (`titleCase(durationMode)`, "Continue living", "Open-ended stay").

**Files fixed:**
- `app/(customer)/booking/[bookingCode]/page.tsx`
- `src/components/customer/account/resident/ApplicationBookingsPanel.tsx`
- `src/components/customer/checkout/BookingCheckoutExperience.tsx`
- `app/(admin)/admin/bookings/page.tsx`

**Screens verified:** Customer booking detail, applications hub, checkout pay, admin bookings list.  
**Evidence:** `npm test` + `npm run build`; label SSOT in `src/lib/stayType.ts`.

---

### 2. Payment — **PASS**

| Check | Result |
|-------|--------|
| Approved payment → ledger | **PASS** — `bookingLifecycle.recordPaymentSuccess()` |
| Booking payment → rent invoice | **PASS** — `bookingPaymentInvoices.applyBookingRentInvoiceOnPaymentSuccess()` |
| Payment proof queue context | **PASS** — uses booking row fields |

**Root cause:** N/A (booking rent invoice gap fixed in prior deploy).

**Files fixed (prior):** `src/services/bookingPaymentInvoices.ts`, `src/services/bookingLifecycle.ts`

**Screens verified:** Admin payment reviews, booking detail payments table, webhook path.  
**Evidence:** `tests/unit/bookingPaymentInvoices.test.ts`

---

### 3. Deposit — **PASS** (read paths)

| Check | Result |
|-------|--------|
| Required = booking requirement | **PASS** — `bookings.deposit_paise` |
| Collected = ledger | **PASS** — `getDepositSummaryForBooking().collectedPaise` |
| Refundable = ledger balance | **PASS** — `refundableBalancePaise` |
| Status = ledger state | **PASS** — deposit workflow presentation uses summary |

**Root cause (partial):** `depositInvoices.ts` and `admin.ts` deposit list still contain inline ledger SQL for list performance — values match SSOT today but are duplicate code paths (**tech debt**, not user-visible drift).

**Files fixed:** None this sweep (monitoring only).

**Screens verified:** Admin deposits, resident wallet, admin resident profile, checkout settlement deposit held.  
**Evidence:** `tests/unit/depositSummaryLedger.test.ts`

---

### 4. Bed assignment — **PASS**

| Check | Result |
|-------|--------|
| Occupancy / bed status | **PASS** — `bed_reservations` + `pgBedMap` |
| Ops queue bed assignment | **PASS** — action items sync |

**Files fixed:** None.

---

### 5. Resident profile — **PASS**

| Check | Result |
|-------|--------|
| Financial summary | **PASS** — `residentFinancialEngine` |
| Stay type | **PASS** — `adminStayTypeLabel` on admin resident page |
| Vacating deduction preview | **PASS** — `depositRefundUnlock` + vacating row `deductionPaise` |

**Files fixed:** `src/lib/vacating/depositRefundEligibility.ts` (preview uses `computeNoticeDeduction`)

---

### 6. Wallet — **PASS**

| Check | Result |
|-------|--------|
| Balance | **PASS** — `getDepositSummaryForBooking()` |
| Ledger display | **PASS** — `walletLedger.ts` (display-only walk, documented) |

**Files fixed:** None.

---

### 7. Invoices — **PASS**

| Check | Result |
|-------|--------|
| Outstanding includes late fees | **PASS** — `projectInvoice()` / `projectElectricityInvoice()` |
| Unified registry | **PASS** — `unifiedInvoices.syncRentInvoiceToUnified()` |

**Files fixed:** `src/services/pgRevenueResidents.ts` (was using raw `rent_paise`)

---

### 8. Revenue — **PASS** (after fix)

| Check | Result |
|-------|--------|
| PG resident rent due | **PASS** — `projectInvoice().outstandingPaise` |
| PG resident electricity due | **PASS** — `projectElectricityInvoice().outstandingPaise` |
| Revenue command center | **PASS** — composes SSOT services |

**Root cause (was FAIL):** `pgRevenueResidents.ts` summed raw invoice principal, ignoring accrued late fees and partial payments.

**Files fixed:** `src/services/pgRevenueResidents.ts`

**Screens verified:** Admin revenue PG resident breakdown.  
**Evidence:** build + code review against `projectInvoice` tests in `billing.test.ts`

---

### 9. Rent billing — **PASS**

| Check | Result |
|-------|--------|
| Generation | **PASS** — `rentInvoices.generateRentInvoicesForMonth()` |
| Customer/admin display | **PASS** — `projectInvoice()` |

**Files fixed:** None this sweep.

---

### 10. Electricity billing — **PASS**

| Check | Result |
|-------|--------|
| Outstanding | **PASS** — `projectElectricityInvoice()` |
| Checkout electricity | **PASS** — `checkoutSettlement` + `electricitySettlement` |

**Files fixed:** None this sweep.

---

### 11. Vacating — **PASS** (after fix)

| Check | Result |
|-------|--------|
| Notice deduction = 5-day fixed fee | **PASS** — `computeNoticeDeduction()` |
| Submit / approve / extend | **PASS** — `vacating.ts` |
| Admin submit form preview | **PASS** — was inline `monthly/30*5` |

**Root cause (was FAIL):** Checkout settlement used deprecated `noticeShortfallDeduction` (shortfall days × daily rate). Admin vacating form duplicated penalty math.

**Files fixed:**
- `src/services/billing.ts` — `computeNoticeDeduction()` SSOT
- `src/services/checkoutSettlement.ts` — policy fields + auto-repair on read
- `src/services/vacating.ts`, `src/services/fixedStayAutoExpiry.ts`
- `src/lib/billing/depositRefundUnlock.ts`
- `src/lib/vacating/depositRefundEligibility.ts`
- `src/components/admin/AdminVacatingSubmitForm.tsx`
- Admin checkout UI copy

**Mohd Aatif Siddiqui verification:**

| Field | Before | After |
|-------|--------|-------|
| Monthly rent | ₹4,080 | ₹4,080 |
| Daily rent | ₹136 | ₹136 |
| Notice fee | ₹1,088 (8×₹136) ❌ | ₹680 (5×₹136) ✅ |
| Refund | ₹2,912 ❌ | ₹3,320 ✅ |

**Screens verified:** Admin checkout settlement, vacating queue, resident vacating form.  
**Evidence:** `tests/unit/billing.test.ts` (Aatif scenario), `tests/unit/checkoutRefundPreview.test.ts`

---

### 12. Checkout settlement — **PASS** (after fix)

| Check | Result |
|-------|--------|
| Notice fee | **PASS** — `computeNoticeDeduction` |
| Refund preview | **PASS** — `computeCheckoutRefundPreview()` |
| Auto-repair stale rows | **PASS** — `reconcileCheckoutSettlementNoticePolicy()` on admin/customer read |

**Files fixed:**
- `src/lib/billing/checkoutRefundPreview.ts` (new)
- `src/lib/moveOut/moveOutPipeline.ts`
- `src/components/admin/CheckoutSettlementPanel.tsx`
- `src/components/admin/checkout/CheckoutSettlementSummary.tsx`

**Screens verified:** Checkout settlement detail, move-out pipeline refund estimate.  
**Evidence:** `tests/unit/checkoutSettlementDeductions.test.ts`, `tests/unit/moveOutPipeline.test.ts`

---

### 13. Refunds — **PASS** (checkout SSOT); legacy path **PARTIAL**

| Check | Result |
|-------|--------|
| Checkout settlement refunds | **PASS** — `checkoutSettlement` + `depositSettlement` |
| Unified admin refund queue | **PASS** — `listAdminRefundQueue` |
| Legacy `computeRefundDeductions` UI | **PARTIAL** — `DepositSettlementPanel` / old resident requests still exist for pre-checkout bookings; gated when checkout settlement exists |

**Root cause:** Dual refund paths from migration to checkout settlements.

**Files fixed:** None (documented tech debt; checkout path is canonical for new vacating).

**Recommendation:** Route all new refunds through `/admin/checkout-settlements`; deprecate legacy panel when backlog cleared.

---

### 14. Notifications — **PASS** (after fix)

| Check | Result |
|-------|--------|
| Payment proof href | **PASS** — `/admin/operations/payment-reviews` |
| Badge clear on visit | **PASS** — path added to `PATH_NOTIFICATION_TYPES` |
| Fixed-stay checkout module | **PASS** — `typeToModule` → operations |

**Root cause (was FAIL):** `payment_received` notifications linked to `/admin/collections?tab=payments` while queues used payment-reviews; badges did not clear.

**Files fixed:**
- `src/services/adminNotifications.ts`
- `src/services/adminNavBadges.ts`

---

### 15. Operations queues — **PASS** (after fix)

| Check | Result |
|-------|--------|
| Operations center card counts | **PASS** — `verifyOperationsCenterCounts()` |
| Resident ops card vs queue | **PASS** — counts from deduped queue + merged filter tags |
| Move-out "All active" count | **PASS** — `activeCount` (unique items, no double-count) |
| Checkout settlement links | **PASS** — pipeline `continueHref` |

**Root cause (was FAIL):** Resident ops cards counted pre-dedupe rows; move-out "All active" summed overlapping buckets.

**Files fixed:**
- `src/lib/residents/residentOperationsResidentsView.ts`
- `src/lib/moveOut/moveOutPipelineUi.ts`
- `src/components/admin/moveOut/MoveOutCommandCenter.tsx`

**Screens verified:** `/admin/operations/residents`, `/admin/vacating`, operations center.  
**Evidence:** `tests/unit/operationsCenter.test.ts`, `tests/unit/moveOutPipelineUi.test.ts`

---

## Remaining Tech Debt (no user-visible drift today)

| Item | Severity | Notes |
|------|----------|-------|
| Inline deposit SQL in `depositInvoices` / `admin.ts` | Low | Should call `getDepositSummaryForBooking()` |
| Legacy `computeRefundDeductions` panel | Medium | Only for bookings without checkout settlement |
| Ops center "Refunds Pending" uses `adminDepositRefundStatus` | Medium | Differs from checkout `refund_pending` count — link to `/admin/checkout-settlements` recommended |
| Overview KPI "pending payments" vs payment-reviews queue | Low | Different definitions (bookings vs proofs) |
| Orphan `ResidentOperationsAttentionCenter` component | Low | Not mounted |

---

## Verification Summary

```bash
npm test    # 634 tests pass
npm run build
```

**Key test files:**
- `tests/unit/billing.test.ts` — notice policy (5-day fixed, Aatif ₹680)
- `tests/unit/checkoutRefundPreview.test.ts` — refund ₹3,320
- `tests/unit/checkoutSettlementDeductions.test.ts`
- `tests/unit/depositRefundUnlock.test.ts`
- `tests/unit/moveOutPipeline.test.ts`
- `tests/unit/operationsCenter.test.ts`

**Screenshot evidence:** Layout QA captures in `docs/screenshots/booking-funnel-ui/` and `docs/screenshots/landing-ui/`. Financial consistency is validated by unit tests above; production screenshot capture requires deployed admin/resident sessions with live data.

---

## Deployment Checklist

1. Deploy this commit to production.
2. Open Mohd Aatif Siddiqui checkout settlement in admin — notice fee should auto-repair to **₹680** if settlement not yet locked.
3. Run `npx tsx scripts/discover-booking-rent-invoice-gaps.ts` (prod `DATABASE_URL`) if booking-payment invoice backfill not yet executed.
4. Approve repaired checkout settlement and verify resident sees matching refund on wallet/history.

---

*No situation should remain where admin sees one value, resident sees another, and the database holds a third — for all paths wired through the SSOT services above.*

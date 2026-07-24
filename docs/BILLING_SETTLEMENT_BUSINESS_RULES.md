# Move-out settlement — business rules (SSOT)

**Status:** Canonical rule book for Awesome PG move-out money.  
**Scope:** Monthly / open-ended stays with vacating + checkout settlement V2. Fixed-stay rules noted where different.

Every engine calculation must map to exactly one **BR-*** rule below. Implementation lives in the linked modules — do not duplicate math in UI or scripts.

**Related:** [BILLING_COVERAGE_MODEL.md](./BILLING_COVERAGE_MODEL.md) · [BILLING_ENGINE.md](./BILLING_ENGINE.md) · [BILLING_ENGINE_INVARIANTS.md](./BILLING_ENGINE_INVARIANTS.md)

---

## Rule index

| ID | Summary |
|----|---------|
| BR-ANCHOR | Anniversary billing day anchored to move-in; periods clamped to check-in |
| BR-FIRST-MONTH | First rent period / checkout proration at move-in |
| BR-LAST-MONTH | Final anniversary period, invoice suppression, tail rent |
| BR-RENT-PAID | Total rent collected on booking |
| BR-RENT-CONSUMED | Stay-based rent usage capped at paid |
| BR-RENT-UNUSED | Paid minus consumed |
| BR-NOTICE-CHARGE | Missing notice days × daily rent |
| BR-NOTICE-PREPAID | Prepaid rent after vacate offsets notice (coverage model) |
| BR-NOTICE-ORDER | Unused rent bucket first, then deposit |
| BR-DEPOSIT-ESCROW | Deposit held is escrow balance, not spendable credit |
| BR-DEPOSIT-PARTIAL | Partial deposit due is outside move-out waterfall until collected |
| BR-TAIL-CHARGE | When tail rent applies |
| BR-TAIL-NONE | When tail rent does not apply |
| BR-REFUND | Total refund composition |
| BR-FIXED-STAY | Notice and monthly tail rules off |
| BR-ELECTRICITY | Electricity deducted from deposit at checkout |
| BR-DAMAGE | Damage charges in checkout other bucket |
| BR-OTHER | Cleaning/custom checkout deductions |
| BR-INVOICE-SUPPRESS | Approved move-out suppresses pending anniversary invoice |
| BR-MONTHLY-STAY | Monthly product: notice + anniversary + room electricity |

---

## BR-ANCHOR — Billing anchor

**Rule:** Rent billing uses an **anniversary cycle** derived from move-in day-of-month (`billingDay`). Paid invoice windows are mapped to `[periodStart, periodEnd]` per due date. **Coverage never starts before actual move-in** — raw invoice periods are clamped to `moveInDate`.

**SSOT:** `clampPaidPeriodToMoveIn`, `clampPaidInvoiceCoverage` in [`src/lib/billing/billingCoverageModel.ts`](../src/lib/billing/billingCoverageModel.ts); anniversary helpers in [`src/services/billing.ts`](../src/services/billing.ts).

**Inputs:** `moveInDate`, paid `rent_invoices`, `billingDay`.  
**Outputs:** `paidInvoiceCoverage`, `currentBillingPeriod`, `paidUntilDate`.

---

## BR-FIRST-MONTH — First month / move-in

**Rule:** The resident’s first billing period may be partial (move-in mid-cycle). Checkout booking payment may include pro-rated first invoice rent; ongoing anniversary generation follows scheduler rules in BILLING_ENGINE. Move-out settlement **does not re-prorate history** — it uses **rent paid ledger total** (BR-RENT-PAID) and **inclusive stay days** from check-in through vacating date.

**SSOT:** Checkout proration [`src/lib/billing/checkoutRentProration.ts`](../src/lib/billing/checkoutRentProration.ts); invoice generation [`src/services/billingScheduler.ts`](../src/services/billingScheduler.ts).

**Settlement boundary:** First-month quirks are reflected in **rent paid** and **paid invoice coverage**, not a separate “first month” line in V2.

---

## BR-LAST-MONTH — Last month (final period)

**Rule:** For **approved** monthly move-out, if vacating falls in an **unpaid** anniversary period before that period’s end, the platform **suppresses** the pending anniversary rent invoice for that period and collects **tail rent** through checkout deposit deductions instead of a separate invoice.

**SSOT:** [`computeVacatingFinalPeriodRentDecision`](../src/lib/billing/vacatingFinalPeriodRent.ts) → BCM `tailRent`, `finalInvoiceSuppression`, `tailRentPaise`; wired into V2 as `checkoutTailRentPaise`.

**Preview vs live:** Settlement **previews** use `treatAsApprovedForTail: true` so projected tail matches post-approval behavior. Live invoice suppression requires approved vacating (see BR-TAIL-CHARGE).

---

## BR-TAIL-CHARGE — When tail rent is charged

**Rule:** Tail applies when:

1. Vacating is **approved** (or treated as approved for preview), and  
2. Final-period decision sets `shouldSuppressFinalInvoice`, and  
3. Tail day count &gt; 0 per final-period logic (including **Case B**: vacate one day after first unpaid day → **one tail day**).

**Formula (conceptual):** `tailRentPaise = tailDays × dailyRateFromMonthly(monthlyRent)`.

**SSOT:** [`vacatingFinalPeriodRent.ts`](../src/lib/billing/vacatingFinalPeriodRent.ts), BCM, V2 `depositBucket.tailRentPaise`.

---

## BR-TAIL-NONE — When tail rent is not charged

**Rule:** No tail when:

- Vacating **inside** a **paid** anniversary window (Case C — rent for that period already collected).  
- Vacating on **period end** with no unpaid tail window (Case A).  
- Vacating **not approved** and not in preview mode (no suppression).  
- Fixed-stay product (no anniversary tail path).

**Regression fixtures:** [`tests/unit/billingCoverageRegression.test.ts`](../tests/unit/billingCoverageRegression.test.ts) Cases A–C.

---

## BR-RENT-PAID — Rent paid

**Rule:** **Rent paid** is the total rent **received** on the booking money ledger (checkout + monthly payments), before move-out allocation.

**SSOT:** [`getBookingMoneyBalances`](../src/services/bookingMoneyBalances.ts) → V2 input `rentPaidPaise`.

**Maps to explainability:** `RULE_RENT_PAID_TOTAL` in [`moveOutSettlementExplanation.ts`](../src/lib/vacating/moveOutSettlementExplanation.ts).

---

## BR-RENT-CONSUMED — Rent used (consumed)

**Rule:** **Rent consumed** = `min(rentPaid, stayDays × dailyRent)` where `stayDays` is inclusive calendar days from check-in through vacating date and `dailyRent = floor(monthlyRent / 30)`.

**SSOT:** [`computeCheckoutSettlementV2`](../src/lib/checkout/checkoutSettlementEngineV2.ts) rent bucket.

**Maps to:** `RULE_RENT_CONSUMED_CAP`.

---

## BR-RENT-UNUSED — Unused rent

**Rule:** **Unused rent** = `rentPaid − rentConsumed`. This is **not** the same as “prepaid days after vacate” (notice display) — unused rent is the **money** left in the rent bucket after stay consumption.

**SSOT:** V2 rent bucket.

**Maps to:** `RULE_UNUSED_RENT`.

**Zero unused:** Expected when stay consumption equals or exceeds rent paid (e.g. long stay, limited payments).

---

## BR-NOTICE-CHARGE — Notice charge

**Rule:** When notice policy applies (`noticeApplies !== false`), **full notice charge** = `missingNoticeDays × dailyRent`, where missing days come from notice engine vs required minimum (e.g. 14 days) given notice given date and vacating date, considering **clamped paid coverage**.

**SSOT:** [`computeNoticeDeductionBreakdown`](../src/lib/vacating/noticeDeductionEngine.ts) via BCM `noticeBreakdown`; V2 `notice.fullPaise`.

**Maps to:** `RULE_NOTICE_CHARGE`.

---

## BR-NOTICE-PREPAID — Prepaid after vacate (notice display)

**Rule:** If paid rent coverage extends **strictly past** vacating date, calendar/paise **prepaid after vacate** can reduce chargeable notice (displayed as notice covered by prepaid rent). This is computed in BCM / notice engine, not by re-reading invoices in UI.

**SSOT:** BCM `paidUntilDate`, `prepaidAfterVacatingDays/Paise`, notice display via [`noticeDisplayFromBillingCoverage`](../src/lib/vacating/loadVacatingBillingPresentation.ts).

---

## BR-NOTICE-ORDER — Settlement order for notice

**Rule (V2 order):**

1. Compute full notice charge.  
2. Apply to **unused rent** first (`notice.fromUnusedRentPaise = min(unusedRent, noticeFull)`).  
3. Remainder from **deposit** (`notice.fromDepositPaise`).  
4. Leftover unused rent after notice may credit refund.

**SSOT:** V2 steps 3–4 in [`checkoutSettlementEngineV2.ts`](../src/lib/checkout/checkoutSettlementEngineV2.ts) header comment.

**Maps to:** `RULE_NOTICE_FROM_UNUSED_FIRST`, `RULE_NOTICE_FROM_DEPOSIT`.

---

## BR-DEPOSIT-ESCROW — Deposit held

**Rule:** Deposit in move-out settlement is **escrow refundable balance** (`getDepositSummaryForBooking.refundableBalancePaise`), not resident credit balance. Credit balance is a separate product (BILLING_ENGINE locked decisions).

**SSOT:** [`getDepositSummaryForBooking`](../src/services/deposits.ts) → V2 `depositCollectedPaise`.

---

## BR-DEPOSIT-PARTIAL — Partial deposit / deposit due

**Rule:** **Deposit due** (partial collection, Operations deposit_due queue) is a **collections** concern. Move-out waterfall uses **held escrow** only. If deposit is incomplete, held balance reflects what was collected; settlement does not invent deposit that was never paid.

**SSOT:** Deposit due labels [`src/lib/depositCollectionLabels.ts`](../src/lib/depositCollectionLabels.ts); allocation at payment review [`applyAdminPaymentAllocation`](../src/services/bookingMoneyBalances.ts) — **outside** V2 waterfall.

**Scope boundary:** Move-out settlement does **not** replace deposit collection workflows.

---

## BR-REFUND — Refund

**Rule:** **Total refund** = refundable deposit after all deposit-bucket deductions **plus** unused rent remaining after notice application. Single payout to resident (UPI at checkout).

**Deposit refundable:** `depositHeld − noticeFromDeposit − tailRent − electricity − other`.

**SSOT:** V2 `depositBucket.refundablePaise`, `notice.unusedRentRemainingPaise`, `refund.totalPaise`.

**Maps to:** `RULE_DEPOSIT_REFUNDABLE`, `RULE_REFUND_TOTAL`.

---

## BR-FIXED-STAY — Fixed-stay / no notice

**Rule:** When `noticeApplies` is false (fixed-stay duration modes), notice charge and missing-notice days are zero; tail/monthly suppression follows product mode in BILLING_ENGINE.

**SSOT:** V2 `noticeApplies`; [`noticeDeductionPolicy`](../src/lib/checkout/noticeDeductionPolicy.ts).

---

## BR-MONTHLY-STAY — Monthly / open-ended stay

**Rule:** Anniversary rent billing, 14-day (or policy) notice, vacating final-period tail, **Workflow A** room electricity on monthly invoices. Move-out settlement uses V2 + BCM as documented above.

**SSOT:** [`BILLING_ENGINE.md`](./BILLING_ENGINE.md) · [`noticeDeductionPolicy`](../src/lib/checkout/noticeDeductionPolicy.ts).

**Contrast:** Fixed-stay uses **BR-FIXED-STAY** (no notice bucket; checkout-only electricity).

---

## BR-INVOICE-SUPPRESS — Final rent invoice suppression

**Rule:** When an **approved** move-out triggers final-period tail collection, the platform **does not generate** the pending anniversary rent invoice for that period; tail is collected in checkout deposit deductions instead.

**SSOT:** [`syncVacatingCheckoutRentBilling`](../src/lib/billing/vacatingCheckoutBilling.ts) · [`generateRentInvoicesForMonth`](../src/services/billingScheduler.ts) · BCM `finalInvoiceSuppression`.

**Preview:** Estimates use `treatAsApprovedForTail: true` so UI matches post-approval behavior without suppressing live invoices for pending requests.

---

## BR-ELECTRICITY — Electricity at settlement

**Rule:** For checkout settlement, electricity owed is computed from room ledger / checkout electricity model and deducted from **deposit** when amounts are locked (not from unused rent bucket). Monthly residents may also have separate electricity invoices during stay (Workflow A).

**SSOT:** [`electricitySettlement.ts`](../src/lib/checkout/electricitySettlement.ts) · [`checkoutSettlement.ts`](../src/services/checkoutSettlement.ts) → V2 `depositBucket.electricityPaise`.

**Estimate mode:** Electricity may show as pending until meter/finalize — not a numeric bug.

---

## BR-DAMAGE — Damage charges

**Rule:** Admin-entered damage (and related checkout damage lines) roll into V2 `depositBucket.otherPaise` (with cleaning/custom), reducing refundable deposit.

**SSOT:** [`computeCheckoutSettlementV2`](../src/lib/checkout/checkoutSettlementEngineV2.ts) · checkout settlement detail inputs.

---

## BR-OTHER — Other deposit deductions

**Rule:** Cleaning fee, custom charges, and non-notice checkout deductions share the **other** deposit bucket line in V2.

**SSOT:** V2 `depositBucket.otherPaise`.

---

## Settlement presentation bundle

All move-out review surfaces must load:

[`loadVacatingBillingPresentation`](../src/lib/vacating/loadVacatingBillingPresentation.ts) → BCM + notice display + V2 waterfall + estimated settlement + explanations.

Do not compute parallel totals in components.

---

## Change control

- New business behavior → new **BR-*** entry here, invariant in [BILLING_ENGINE_INVARIANTS.md](./BILLING_ENGINE_INVARIANTS.md), regression test, then code.  
- No per-resident SQL to “make pass” — fix SSOT module once per failure **signature**.

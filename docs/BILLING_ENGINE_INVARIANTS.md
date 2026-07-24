# Billing engine invariants — move-out settlement

**Status:** Enforced via [`billingEngineValidation.ts`](../src/lib/billing/billingEngineValidation.ts).  
**Related:** [BILLING_SETTLEMENT_BUSINESS_RULES.md](./BILLING_SETTLEMENT_BUSINESS_RULES.md) · [BILLING_SETTLEMENT_ENGINE_FINAL_REPORT.md](./BILLING_SETTLEMENT_ENGINE_FINAL_REPORT.md)

Violations are **engine bugs**. Fix by signature — never per-resident SQL ([SETTLEMENT_REPAIR_POLICY.md](./SETTLEMENT_REPAIR_POLICY.md)).

---

## Waterfall (CheckoutSettlementEngineV2)

| ID | Statement | Signature | Impl | Code |
|----|-----------|-----------|------|------|
| **INV-W1** | `rentPaid = rentConsumed + unusedRent` | `WATERFALL_INCONSISTENT` | Y | [`settlementInvariants.ts`](../src/lib/checkout/settlementInvariants.ts) |
| **INV-W2** | `depositRefundable = depositHeld − noticeFromDeposit − tail − electricity − other` | `WATERFALL_INCONSISTENT` | Y | same |
| **INV-W3** | `refundTotal = depositRefundable + unusedRentAfterNotice` | `WATERFALL_INCONSISTENT` | Y | same |

---

## Notice bucket

| ID | Statement | Signature | Impl | Code |
|----|-----------|-----------|------|------|
| **INV-N1** | `noticeFull = noticeFromUnused + noticeFromDeposit` | `NOTICE_SPLIT_MISMATCH` | Y | [`billingEngineValidation.ts`](../src/lib/billing/billingEngineValidation.ts) |
| **INV-N2** | `noticeFromUnused ≤ min(unusedRent, noticeFull)` | `NOTICE_UNUSED_CAP` | Y | same |
| **INV-N3** | `missingNoticeDays` waterfall = BCM | `NOTICE_DAYS_DRIFT` | Y | same |

---

## Non-negativity

| ID | Statement | Signature | Impl | Code |
|----|-----------|-----------|------|------|
| **INV-P1** | All waterfall paise ≥ 0 | `NEGATIVE_PAISE` | Y | same |

---

## Billing coverage & tail

| ID | Statement | Signature | Impl | Code |
|----|-----------|-----------|------|------|
| **INV-C1** | Paid coverage starts ≥ move-in | `COVERAGE_BEFORE_MOVEIN` | Y | same + [`billingCoverageModel.ts`](../src/lib/billing/billingCoverageModel.ts) |
| **INV-C2** | `waterfall.tailRentPaise === coverage.tailRentPaise` | `TAIL_MISMATCH` | Y | same; locked checkout uses [`alignCoverageToLockedWaterfall`](../src/lib/vacating/loadVacatingBillingPresentation.ts) |
| **INV-C3** | No tail when vacate ∈ paid window | `TAIL_IN_PAID_PERIOD` | Y | same |
| **INV-C4** | Tail days do not overlap paid coverage | `TAIL_OVERLAP_PAID` | Y | same |

---

## Explainability & UI parity

| ID | Statement | Signature | Impl | Code |
|----|-----------|-----------|------|------|
| **INV-E1** | All explanation lines complete | `EXPLANATION_GAP` | Y | [`moveOutSettlementExplanation.ts`](../src/lib/vacating/moveOutSettlementExplanation.ts) |
| **INV-E2** | Explanation values = waterfall | `EXPLANATION_VALUE_MISMATCH` | Y | same |
| **INV-E3** | Preview rows match waterfall | `UI_ROW_MISMATCH` | Y | [`billingEngineValidation.ts`](../src/lib/billing/billingEngineValidation.ts) |
| **INV-E4** | ₹0 lines have reason text | `ZERO_WITHOUT_REASON` | Y | same |

---

## Cross-surface & stored snapshots

| ID | Statement | Signature | Impl | Code |
|----|-----------|-----------|------|------|
| **INV-X1** | Locked waterfall matches presentation fields | `CHECKOUT_PREVIEW_DRIFT` | Y | [`billingEngineValidation.ts`](../src/lib/billing/billingEngineValidation.ts) |
| **INV-X2** | Pending `deduction_paise` vs engine | `STORED_ROW_DRIFT` | Y | same |

---

## Production validation

```bash
USE_PRODUCTION_DB=1 npx tsx scripts/validate-active-moveout-billing-engine.ts
USE_PRODUCTION_DB=1 npx tsx scripts/verify-settlement-business-policy.ts
```

Local gate:

```bash
npx tsx --test tests/unit/billingEngineValidation.test.ts tests/unit/moveOutSettlementExplanation.test.ts tests/unit/settlementRuleRegistry.test.ts tests/unit/billingCoverageRegression.test.ts
```

Reports: [FINAL_PRODUCTION_VALIDATION.md](./validation/FINAL_PRODUCTION_VALIDATION.md) · [POLICY_SPOTCHECKS.md](./validation/POLICY_SPOTCHECKS.md)

---

## Root-cause routing

| Signature | Fix once in |
|-----------|-------------|
| `TAIL_MISMATCH`, `TAIL_*` | `vacatingFinalPeriodRent.ts`, BCM, `alignCoverageToLockedWaterfall` |
| `NOTICE_*` | BCM ↔ V2 notice wiring |
| `UI_*`, `EXPLANATION_*`, `ZERO_*` | Preview sections / explanation builder |
| `STORED_ROW_DRIFT` | Vacating submit snapshot vs engine |
| `CHECKOUT_PREVIEW_DRIFT` | Checkout lock vs presentation loader |

# Settlement engine freeze (feature complete)

**Effective:** 2026-07-24  
**Status:** Billing & Settlement Engine logic is **frozen**.

## Do not change

Without explicit owner approval **and** a failing gate:

- `src/lib/checkout/checkoutSettlementEngineV2.ts`
- `src/lib/billing/billingCoverageModel.ts`
- `src/lib/billing/vacatingFinalPeriodRent.ts`
- `src/lib/vacating/noticeDeductionEngine.ts`
- `src/lib/billing/billingEngineValidation.ts` (except new invariant definitions when business rules change)
- `src/services/bookingMoneyBalances.ts` allocation math used by settlement
- BCM → V2 wiring in `computeVacatingSettlementPreview.ts` / `loadVacatingBillingPresentation.ts` **except** display alignment (`alignCoverageToLockedWaterfall`) — no formula changes

## Allowed changes without reopening the engine

- UI copy, layout, collapsible sections, hero emphasis
- New surfaces that **consume** `loadVacatingBillingPresentationBundle` (no parallel totals)
- Docs, UX guides, accountant-only expandables
- Tests that assert existing behavior (no loosening invariants to “make green”)

## When engine changes ARE allowed

1. **Invariant failure** — `npm run test:billing-settlement` or prod `validate-active-moveout-billing-engine.ts` fails  
2. **Production validation failure** — grouped signature in [FINAL_PRODUCTION_VALIDATION.md](./validation/FINAL_PRODUCTION_VALIDATION.md)  
3. **Business rule change** — update [BILLING_SETTLEMENT_BUSINESS_RULES.md](./BILLING_SETTLEMENT_BUSINESS_RULES.md) first, then one SSOT fix + regression test ([SETTLEMENT_REPAIR_POLICY.md](./SETTLEMENT_REPAIR_POLICY.md))

## UX goals (ongoing work)

| Audience | Goal |
|----------|------|
| Resident | Understand settlement in **under 15 seconds** (refund + leaving date first) |
| Admin | Approve move-out in **under 10 seconds** (scan refund + dates, one confirm) |
| Accountant | Full audit via expandables (formulas, trace, PDF) |

See [validation/SETTLEMENT_UX_GUIDE.md](./validation/SETTLEMENT_UX_GUIDE.md) for audience rules (`resident` | `adminReview` | `accountant`) and forbidden default UI concepts. Presentation SSOT: `src/lib/vacating/settlementPresentationAudience.ts`.

# Settlement repair policy

**Rule:** Never patch individual residents to fix settlement math or explainability.

## Forbidden

- One-off SQL or scripts that adjust `deduction_paise`, checkout settlement rows, or invoice totals for a **single booking** to make validation pass (e.g. `repair-premature-settlement-kunal.ts` pattern).
- UI-only overrides that hide waterfall inconsistencies.

## Required when validation fails

1. Group failures by **signature** (`TAIL_MISMATCH`, `NOTICE_DAYS_DRIFT`, etc.).
2. Fix the **single SSOT module** mapped in [BILLING_ENGINE_INVARIANTS.md](./BILLING_ENGINE_INVARIANTS.md).
3. Add a **regression test** in `tests/unit/billingEngineValidation.test.ts` or `billingCoverageRegression.test.ts`.
4. Re-run `USE_PRODUCTION_DB=1 npx tsx scripts/validate-active-moveout-billing-engine.ts`.

## Allowed operational repairs

- Data hygiene unrelated to settlement formulas (auth, bed lifecycle, duplicate invoices) — document in runbooks separately.
- **Re-lock** checkout settlement after an engine fix if historical locked rows are wrong (rare; requires admin workflow, not silent SQL).

## Validation gates

- Local: `npx tsx --test tests/unit/billingEngineValidation.test.ts tests/unit/moveOutSettlementExplanation.test.ts tests/unit/billingCoverageRegression.test.ts tests/unit/settlementRuleRegistry.test.ts`
- Production (read-only): `scripts/validate-active-moveout-billing-engine.ts`

# Personal Finance OS (Owner OS)

> Your financial intelligence system. Consumes Brain APIs / Engine public services.  
> Does **not** own PG rent math, Salon paid-revenue SQL, or Capital TVI recalculation.  
> Baseline: [[ECOSYSTEM_BASELINE_V1]] — Health Score must remain **100**. Health Brain not modified.

## Golden rules

- No Engine owns Personal Finance.
- Personal Finance Brain only **consumes** public getters + Workforce connectors.
- Every number is an `ExplainableValue` (brain, engine, calculation, lineage).
- Owner Dashboard / Owner OS presents this Brain — not a PG-only KPI strip.

## Module map

| Path | Role |
|------|------|
| `src/personalFinance/brains/personalFinanceBrain.ts` | Snapshot composer |
| `src/personalFinance/brains/ownerOs.ts` | Owner life dashboard API |
| `src/personalFinance/adapters/*` | PG / Salon / Capital / Workforce |
| `src/personalFinance/explain.ts` | Explainable primitives |

## Flag

`PERSONAL_FINANCE_OS` defaults **ON**. Set `0` / `false` / `off` to disable UI wiring.

## Connected Engines (v1)

- Awesome PG — `getFinancialMetrics`, deposits, portfolio totals
- FYH Salon — `getRevenueDashboardSnapshot`
- Automotive Capital — `getDealershipReportKpis` (read-only)
- Workforce — `getWorkforceFinanceContribution`

## Future (unconnected zeros)

Bank · Real Estate · Crypto · Stocks · Loans · Insurance · Household expenses

## Phases

| Phase | Scope | Status |
|-------|--------|--------|
| **1** | Brain + explainables + adapters | **Complete** |
| **2** | Owner OS dashboard UI (life dashboard) | **Complete** |
| **3** | Trends, bank/loan connectors, deeper FI | Pending |

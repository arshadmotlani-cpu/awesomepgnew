/**
 * Awesome PG adapter — consumes financialMetricsEngine + deposit/outstanding public APIs only.
 */
import { getFinancialMetrics } from '@/src/services/financialMetricsEngine';
import { getOwnerFinancialSummary } from '@/src/services/ownerFinancialSummary';
import { getDepositPortfolioMetrics } from '@/src/services/depositLedgerMetrics';
import { getPortfolioRentStats } from '@/src/services/residentFinancialEngine';
import { moneyValue } from '@/src/personalFinance/explain';
import type { EngineContribution } from '@/src/personalFinance/types';

export async function loadPgContribution(billingMonth?: string): Promise<EngineContribution> {
  try {
    const [metrics, deposits, rentStats, ownerSummary] = await Promise.all([
      getFinancialMetrics(billingMonth),
      getDepositPortfolioMetrics(billingMonth),
      getPortfolioRentStats().catch(() => null),
      getOwnerFinancialSummary({ month: billingMonth }).catch(() => null),
    ]);

    const revenuePaise = metrics.operating.operatingRevenuePaise;
    const expensesPaise = ownerSummary?.expensePaise ?? 0;
    const profitPaise = revenuePaise - expensesPaise;
    const assetsPaise = deposits.heldPaise ?? 0;
    const liabilitiesPaise = rentStats?.outstandingPaise ?? 0;

    return {
      engine: 'awesome_pg',
      label: 'Awesome PG',
      available: true,
      revenuePaise: moneyValue({
        id: 'pg_business_revenue',
        label: 'PG operating revenue (MTD)',
        paise: revenuePaise,
        brain: 'finance',
        engine: 'awesome_pg',
        calculation: 'getFinancialMetrics().operating.operatingRevenuePaise (rent+late+elec+other)',
        sourceApi: 'getFinancialMetrics',
        lineage: [
          { label: 'Rent principal', paise: metrics.operating.rentPrincipalPaise },
          { label: 'Late fees', paise: metrics.operating.lateFeePaise },
          { label: 'Electricity', paise: metrics.operating.electricityPaise },
          { label: 'Other', paise: metrics.operating.otherIncomePaise },
        ],
      }),
      expensesPaise: moneyValue({
        id: 'pg_business_expenses',
        label: 'PG operating expenses',
        paise: expensesPaise,
        brain: 'finance',
        engine: 'awesome_pg',
        calculation: ownerSummary
          ? 'getOwnerFinancialSummary().expensePaise'
          : 'No public PG expense API — 0 until synced',
        sourceApi: 'getOwnerFinancialSummary',
        provisional: !ownerSummary || expensesPaise === 0,
        connected: ownerSummary != null,
        lineage: [{ label: 'Operating expenses', paise: expensesPaise }],
      }),
      profitPaise: moneyValue({
        id: 'pg_business_profit',
        label: 'PG contribution (revenue − expenses)',
        paise: profitPaise,
        brain: 'personal_finance',
        engine: 'awesome_pg',
        calculation: 'pg_revenue − pg_expenses',
        sourceApi: 'personalFinance.adapters.pg',
        lineage: [
          { label: 'Revenue', paise: revenuePaise },
          { label: 'Expenses', paise: expensesPaise },
        ],
      }),
      assetsPaise: moneyValue({
        id: 'pg_assets_deposits_held',
        label: 'PG deposits held',
        paise: assetsPaise,
        brain: 'finance',
        engine: 'awesome_pg',
        calculation: 'getDepositPortfolioMetrics().heldPaise',
        sourceApi: 'getDepositPortfolioMetrics',
        lineage: [{ label: 'Deposits held', paise: assetsPaise }],
      }),
      liabilitiesPaise: moneyValue({
        id: 'pg_liabilities_outstanding',
        label: 'PG resident outstanding',
        paise: liabilitiesPaise,
        brain: 'finance',
        engine: 'awesome_pg',
        calculation: 'getPortfolioRentStats().outstandingPaise (receivable — not owner liability)',
        sourceApi: 'getPortfolioRentStats',
        provisional: true,
        lineage: [{ label: 'Outstanding collections', paise: liabilitiesPaise }],
      }),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'PG adapter failed';
    const zero = (id: string, label: string) =>
      moneyValue({
        id,
        label,
        paise: 0,
        brain: 'finance',
        engine: 'awesome_pg',
        calculation: msg,
        sourceApi: 'getFinancialMetrics',
        provisional: true,
        connected: false,
      });
    return {
      engine: 'awesome_pg',
      label: 'Awesome PG',
      available: false,
      error: msg,
      revenuePaise: zero('pg_business_revenue', 'PG operating revenue (MTD)'),
      expensesPaise: zero('pg_business_expenses', 'PG operating expenses'),
      profitPaise: zero('pg_business_profit', 'PG contribution'),
      assetsPaise: zero('pg_assets_deposits_held', 'PG deposits held'),
      liabilitiesPaise: zero('pg_liabilities_outstanding', 'PG outstanding'),
    };
  }
}

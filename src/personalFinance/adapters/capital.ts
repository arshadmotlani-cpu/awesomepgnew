/**
 * Automotive Capital adapter — consumes getDealershipReportKpis only (no recalculate writers).
 */
import { getDealershipReportKpis } from '@/src/capital/services/analytics';
import { getCapitalOwnerWealthSummary } from '@/src/capital/services/ownerWealthSummary';
import { moneyValue } from '@/src/personalFinance/explain';
import type { EngineContribution } from '@/src/personalFinance/types';

export async function loadCapitalContribution(): Promise<EngineContribution> {
  try {
    const [kpis, ownerSummary] = await Promise.all([
      getDealershipReportKpis(),
      getCapitalOwnerWealthSummary().catch(() => null),
    ]);
    const vehiclePortfolio = Number(kpis.currentInvestmentPaise ?? kpis.activeCapitalPaise ?? 0) || 0;
    const revenuePaise = Number(kpis.monthlyProfitPaise ?? 0) || 0;
    const expensesPaise = ownerSummary?.expensePaise ?? 0;
    const profitPaise = revenuePaise;
    const lifetime = Number(kpis.lifetimeProfitPaise ?? 0) || 0;

    return {
      engine: 'automotive_capital',
      label: 'Automotive Capital',
      available: true,
      revenuePaise: moneyValue({
        id: 'capital_monthly_profit',
        label: 'Capital monthly profit (entitled)',
        paise: revenuePaise,
        brain: 'finance',
        engine: 'automotive_capital',
        calculation: 'getDealershipReportKpis().monthlyProfitPaise',
        sourceApi: 'getDealershipReportKpis',
        lineage: [
          { label: 'Monthly profit', paise: revenuePaise },
          { label: 'Lifetime profit', paise: lifetime },
        ],
      }),
      expensesPaise: moneyValue({
        id: 'capital_expenses',
        label: 'Capital expenses (period)',
        paise: expensesPaise,
        brain: 'finance',
        engine: 'automotive_capital',
        calculation: ownerSummary
          ? 'getCapitalOwnerWealthSummary().expensePaise'
          : 'ac_expenses MTD sum',
        sourceApi: 'getCapitalOwnerWealthSummary',
        provisional: !ownerSummary,
        connected: ownerSummary != null,
        lineage: [{ label: 'Operating expenses', paise: expensesPaise }],
      }),
      profitPaise: moneyValue({
        id: 'capital_business_profit',
        label: 'Capital contribution',
        paise: profitPaise,
        brain: 'personal_finance',
        engine: 'automotive_capital',
        calculation: 'Equals monthlyProfitPaise from Capital KPIs',
        sourceApi: 'personalFinance.adapters.capital',
        lineage: [{ label: 'Monthly profit', paise: profitPaise }],
      }),
      assetsPaise: moneyValue({
        id: 'capital_vehicle_portfolio',
        label: 'Vehicle portfolio (current investment)',
        paise: vehiclePortfolio,
        brain: 'finance',
        engine: 'automotive_capital',
        calculation: 'getDealershipReportKpis().currentInvestmentPaise',
        sourceApi: 'getDealershipReportKpis',
        lineage: [{ label: 'Current investment', paise: vehiclePortfolio }],
      }),
      liabilitiesPaise: moneyValue({
        id: 'capital_liabilities',
        label: 'Capital liabilities',
        paise: 0,
        brain: 'finance',
        engine: 'automotive_capital',
        calculation: 'Unconnected investor payables — provisional 0',
        sourceApi: 'unconnected',
        provisional: true,
        connected: false,
        lineage: [],
      }),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Capital adapter failed';
    const zero = (id: string, label: string) =>
      moneyValue({
        id,
        label,
        paise: 0,
        brain: 'finance',
        engine: 'automotive_capital',
        calculation: msg,
        sourceApi: 'getDealershipReportKpis',
        provisional: true,
        connected: false,
      });
    return {
      engine: 'automotive_capital',
      label: 'Automotive Capital',
      available: false,
      error: msg,
      revenuePaise: zero('capital_monthly_profit', 'Capital monthly profit'),
      expensesPaise: zero('capital_expenses', 'Capital expenses'),
      profitPaise: zero('capital_business_profit', 'Capital contribution'),
      assetsPaise: zero('capital_vehicle_portfolio', 'Vehicle portfolio'),
      liabilitiesPaise: zero('capital_liabilities', 'Capital liabilities'),
    };
  }
}

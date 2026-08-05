/**
 * Personal Finance Brain — Owner life financial intelligence.
 * Consumes Engine Brain APIs via adapters. Does not duplicate rent/TVI/salon math.
 */
import { loadCapitalContribution } from '@/src/personalFinance/adapters/capital';
import { loadPgContribution } from '@/src/personalFinance/adapters/pg';
import { loadSalonContribution } from '@/src/personalFinance/adapters/salon';
import { unconnectedMoney } from '@/src/personalFinance/adapters/unconnected';
import { loadWorkforceContribution } from '@/src/personalFinance/adapters/workforce';
import { moneyValue, percentValue, sumMoney } from '@/src/personalFinance/explain';
import { deriveIncomeRates, financialIndependencePercent } from '@/src/personalFinance/lib/rates';
import type {
  EngineContribution,
  ExplainableValue,
  PersonalFinanceSnapshot,
} from '@/src/personalFinance/types';

function findMetric(metrics: ExplainableValue[], id: string): ExplainableValue | undefined {
  return metrics.find((m) => m.id === id);
}

export async function getPersonalFinanceSnapshot(opts?: {
  billingMonth?: string;
  includeWorkforce?: boolean;
}): Promise<PersonalFinanceSnapshot> {
  const includeWorkforce = opts?.includeWorkforce !== false;

  const [pg, salon, capital, workforce] = await Promise.all([
    loadPgContribution(opts?.billingMonth),
    loadSalonContribution(),
    loadCapitalContribution(),
    includeWorkforce
      ? loadWorkforceContribution()
      : Promise.resolve(null as EngineContribution | null),
  ]);

  const contributions: EngineContribution[] = [pg, salon, capital];
  if (workforce) contributions.push(workforce);

  const businessRevenue = sumMoney(
    'business_revenue',
    'Business Revenue',
    [pg.revenuePaise, salon.revenuePaise, capital.revenuePaise],
    'Σ engine revenues (PG operating + Salon MTD + Capital monthly profit)',
  );

  const businessExpenses = sumMoney(
    'business_expenses',
    'Business Expenses',
    [
      pg.expensesPaise,
      salon.expensesPaise,
      capital.expensesPaise,
      ...(workforce ? [workforce.expensesPaise] : []),
    ],
    'Σ engine expenses + workforce salary liability (provisional where APIs missing)',
  );

  const businessProfit = moneyValue({
    id: 'business_profit',
    label: 'Business Profit',
    paise: businessRevenue.paise - businessExpenses.paise,
    brain: 'personal_finance',
    engine: 'personal_finance',
    calculation: 'business_revenue − business_expenses',
    sourceApi: 'personalFinanceBrain.compose',
    lineage: [
      { label: 'Business revenue', paise: businessRevenue.paise, ref: businessRevenue.id },
      { label: 'Business expenses', paise: businessExpenses.paise, ref: businessExpenses.id },
    ],
  });

  const propertyValue = moneyValue({
    id: 'property_value',
    label: 'Property Value',
    paise: 0,
    brain: 'personal_finance',
    engine: 'unconnected',
    calculation: 'Real Estate Engine not connected',
    sourceApi: 'unconnected',
    provisional: true,
    lineage: [],
  });

  const vehiclePortfolio = capital.assetsPaise;

  const investmentValue = sumMoney(
    'investment_value',
    'Investment Value',
    [vehiclePortfolio],
    'Σ connected investment Engines (Capital vehicle portfolio today)',
  );

  const bankBalance = unconnectedMoney('bank_balance', 'Bank Balance', 'Bank / Cash Engine');
  const loans = unconnectedMoney('loans', 'Loans', 'Loans Engine');
  const emis = unconnectedMoney('emis', 'EMIs', 'Loans Engine');
  const insurance = unconnectedMoney('insurance', 'Insurance', 'Insurance Engine');

  // Deposits held are customer liabilities to PG, not owner assets for net worth.
  // Owner assets ≈ vehicle portfolio + bank + property + investments.
  const assets = sumMoney(
    'assets',
    'Assets',
    [bankBalance, investmentValue, propertyValue],
    'bank + investments + property (PG deposits held excluded — customer liability)',
  );

  const liabilities = sumMoney(
    'liabilities',
    'Liabilities',
    [
      loans,
      emis,
      insurance,
      ...(workforce ? [workforce.liabilitiesPaise] : []),
    ],
    'loans + EMIs + insurance + payroll liabilities (connected)',
  );

  const currentNetWorth = moneyValue({
    id: 'current_net_worth',
    label: 'Current Net Worth',
    paise: assets.paise - liabilities.paise,
    brain: 'personal_finance',
    engine: 'personal_finance',
    calculation: 'assets − liabilities',
    sourceApi: 'personalFinanceBrain.compose',
    lineage: [
      { label: 'Assets', paise: assets.paise, ref: assets.id },
      { label: 'Liabilities', paise: liabilities.paise, ref: liabilities.id },
    ],
  });

  const cashAvailable = moneyValue({
    id: 'cash_available',
    label: 'Cash Available',
    paise: bankBalance.paise, // bank only until free-cash API
    brain: 'personal_finance',
    engine: 'personal_finance',
    calculation: 'bank_balance (Capital freeCash not yet mapped)',
    sourceApi: 'personalFinanceBrain.compose',
    provisional: true,
    lineage: [{ label: 'Bank balance', paise: bankBalance.paise, ref: bankBalance.id }],
  });

  const monthlyIncome = moneyValue({
    id: 'monthly_income',
    label: 'Monthly Income',
    paise: businessProfit.paise > 0 ? businessProfit.paise : businessRevenue.paise,
    brain: 'personal_finance',
    engine: 'personal_finance',
    calculation:
      businessProfit.paise > 0
        ? 'Uses business_profit when ≥ 0'
        : 'Falls back to business_revenue when profit negative/zero provisional expenses',
    sourceApi: 'personalFinanceBrain.compose',
    lineage: [
      { label: 'Business profit', paise: businessProfit.paise, ref: businessProfit.id },
      { label: 'Business revenue', paise: businessRevenue.paise, ref: businessRevenue.id },
    ],
  });

  const rates = deriveIncomeRates(monthlyIncome);

  const recurringIncome = moneyValue({
    id: 'recurring_income',
    label: 'Recurring Income',
    paise: pg.revenuePaise.paise,
    brain: 'personal_finance',
    engine: 'awesome_pg',
    calculation: 'PG operating revenue treated as recurring (rent-led)',
    sourceApi: 'getFinancialMetrics',
    lineage: [{ label: pg.revenuePaise.label, paise: pg.revenuePaise.paise, ref: pg.revenuePaise.id }],
  });

  const passiveIncome = moneyValue({
    id: 'passive_income',
    label: 'Passive Income',
    paise: capital.revenuePaise.paise,
    brain: 'personal_finance',
    engine: 'automotive_capital',
    calculation: 'Capital monthly profit as passive/portfolio income proxy',
    sourceApi: 'getDealershipReportKpis',
    lineage: [
      {
        label: capital.revenuePaise.label,
        paise: capital.revenuePaise.paise,
        ref: capital.revenuePaise.id,
      },
    ],
    provisional: true,
  });

  const cashflow = moneyValue({
    id: 'cashflow',
    label: 'Cashflow',
    paise: businessRevenue.paise - businessExpenses.paise,
    brain: 'personal_finance',
    engine: 'personal_finance',
    calculation: 'business_revenue − business_expenses (same as business_profit for now)',
    sourceApi: 'personalFinanceBrain.compose',
    lineage: [
      { label: 'Inflows', paise: businessRevenue.paise },
      { label: 'Outflows', paise: businessExpenses.paise },
    ],
  });

  const totalRevenueForShare = Math.max(1, businessRevenue.paise);
  const businessContributionPct = percentValue({
    id: 'business_contribution_pct',
    label: 'Business Contribution %',
    percent: Math.round((pg.revenuePaise.paise * 1000) / totalRevenueForShare) / 10,
    brain: 'personal_finance',
    engine: 'personal_finance',
    calculation: '(PG revenue ÷ total business revenue) × 100 — primary engine share',
    sourceApi: 'personalFinanceBrain.compose',
    lineage: [
      { label: 'PG revenue', paise: pg.revenuePaise.paise },
      { label: 'Total business revenue', paise: businessRevenue.paise },
    ],
  });

  const roiPct = percentValue({
    id: 'roi_pct',
    label: 'ROI',
    percent:
      vehiclePortfolio.paise > 0
        ? Math.round((capital.revenuePaise.paise * 10000) / vehiclePortfolio.paise) / 100
        : 0,
    brain: 'personal_finance',
    engine: 'automotive_capital',
    calculation:
      vehiclePortfolio.paise > 0
        ? '(capital monthly profit ÷ vehicle portfolio) × 100'
        : 'No portfolio capital — 0%',
    sourceApi: 'getDealershipReportKpis',
    lineage: [
      { label: 'Monthly profit', paise: capital.revenuePaise.paise },
      { label: 'Portfolio', paise: vehiclePortfolio.paise },
    ],
  });

  const profitTrendPct = percentValue({
    id: 'profit_trend_pct',
    label: 'Profit Trend',
    percent: 0,
    brain: 'personal_finance',
    engine: 'personal_finance',
    calculation: 'MoM series not yet wired — provisional 0',
    sourceApi: 'unconnected',
    provisional: true,
    lineage: [],
  });

  const netWorthTrendPct = percentValue({
    id: 'net_worth_trend_pct',
    label: 'Net Worth Trend',
    percent: 0,
    brain: 'personal_finance',
    engine: 'personal_finance',
    calculation: 'Historical net worth series not yet wired — provisional 0',
    sourceApi: 'unconnected',
    provisional: true,
    lineage: [],
  });

  const fi = financialIndependencePercent({
    passiveIncomePaise: passiveIncome.paise,
    monthlyBurnPaise: businessExpenses.paise > 0 ? businessExpenses.paise : monthlyIncome.paise,
  });

  const metrics: ExplainableValue[] = [
    currentNetWorth,
    cashAvailable,
    bankBalance,
    businessRevenue,
    businessExpenses,
    businessProfit,
    monthlyIncome,
    rates.quarterly,
    rates.yearly,
    rates.daily,
    rates.hourly,
    recurringIncome,
    passiveIncome,
    assets,
    liabilities,
    loans,
    emis,
    insurance,
    investmentValue,
    propertyValue,
    vehiclePortfolio,
    cashflow,
    profitTrendPct,
    netWorthTrendPct,
    roiPct,
    businessContributionPct,
    fi,
  ];

  return {
    asOf: new Date().toISOString(),
    currentNetWorth,
    cashAvailable,
    bankBalance,
    businessRevenue,
    businessExpenses,
    businessProfit,
    monthlyIncome,
    quarterlyIncome: rates.quarterly,
    yearlyIncome: rates.yearly,
    dailyIncome: rates.daily,
    hourlyIncome: rates.hourly,
    recurringIncome,
    passiveIncome,
    assets,
    liabilities,
    loans,
    emis,
    insurance,
    investmentValue,
    propertyValue,
    vehiclePortfolio,
    cashflow,
    profitTrendPct,
    netWorthTrendPct,
    roiPct,
    businessContributionPct,
    financialIndependencePct: fi,
    contributions,
    metrics,
  };
}

export function explainMetric(
  snapshot: PersonalFinanceSnapshot,
  metricId: string,
): ExplainableValue | null {
  return findMetric(snapshot.metrics, metricId) ?? null;
}

/**
 * Personal Finance Brain — Owner life financial intelligence.
 * Consumes Engine Brain APIs via adapters. Does not duplicate rent/TVI/salon math.
 */
import { getDealershipReportKpis } from '@/src/capital/services/analytics';
import { loadCapitalContribution } from '@/src/personalFinance/adapters/capital';
import { loadPgContribution } from '@/src/personalFinance/adapters/pg';
import { loadSalonContribution } from '@/src/personalFinance/adapters/salon';
import { notConnectedMoney, notConnectedPercent } from '@/src/personalFinance/adapters/unconnected';
import { loadWorkforceContribution } from '@/src/personalFinance/adapters/workforce';
import { connectedIfAllConnected, moneyValue, percentValue, sumMoney } from '@/src/personalFinance/explain';
import { deriveIncomeRates, financialIndependencePercent } from '@/src/personalFinance/lib/rates';
import { loadBillingOperationsDashboard } from '@/src/services/billingOperationsDashboard';
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

  const [pg, salon, capital, workforce, billingOps, capitalKpis] = await Promise.all([
    loadPgContribution(opts?.billingMonth),
    loadSalonContribution(),
    loadCapitalContribution(),
    includeWorkforce
      ? loadWorkforceContribution()
      : Promise.resolve(null as EngineContribution | null),
    loadBillingOperationsDashboard().catch(() => null),
    getDealershipReportKpis().catch(() => null),
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
    connected: connectedIfAllConnected([businessRevenue, businessExpenses]),
    lineage: [
      { label: 'Business revenue', paise: businessRevenue.paise, ref: businessRevenue.id },
      { label: 'Business expenses', paise: businessExpenses.paise, ref: businessExpenses.id },
    ],
  });

  const propertyValue = notConnectedMoney('property_value', 'Property Value', 'Real Estate Engine');

  const vehiclePortfolio = capital.assetsPaise;

  const investmentValue = sumMoney(
    'investment_value',
    'Investment Value',
    [vehiclePortfolio],
    'Σ connected investment Engines (Capital vehicle portfolio today)',
  );

  const bankBalance = notConnectedMoney('bank_balance', 'Bank Balance', 'Bank / Cash Engine');
  const loans = notConnectedMoney('loans', 'Loans', 'Loans Engine');
  const emis = notConnectedMoney('emis', 'EMIs', 'Loans Engine');
  const insurance = notConnectedMoney('insurance', 'Insurance', 'Insurance Engine');
  const upcomingPayments = notConnectedMoney(
    'upcoming_payments',
    'Upcoming Payments',
    'Payments / Liability Engine',
  );
  const upcomingEmis = notConnectedMoney('upcoming_loan_emis', 'Upcoming Loan EMIs', 'Loans Engine');
  const todayExpenses = notConnectedMoney(
    'today_expenses',
    "Today's Expenses",
    'Cross-engine expense APIs',
  );
  const todayProfit = notConnectedMoney(
    'today_profit',
    "Today's Profit",
    "Today's income − today's expenses",
  );

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
    connected: connectedIfAllConnected([assets, liabilities]),
    lineage: [
      { label: 'Assets', paise: assets.paise, ref: assets.id },
      { label: 'Liabilities', paise: liabilities.paise, ref: liabilities.id },
    ],
  });

  const freeCashPaise = Number(capitalKpis?.freeCashPaise ?? 0) || 0;
  const cashAvailable = capital.available
    ? moneyValue({
        id: 'cash_available',
        label: 'Cash Available',
        paise: freeCashPaise,
        brain: 'personal_finance',
        engine: 'automotive_capital',
        calculation: 'getDealershipReportKpis().freeCashPaise',
        sourceApi: 'getDealershipReportKpis',
        connected: true,
        lineage: [{ label: 'Capital free cash', paise: freeCashPaise }],
      })
    : notConnectedMoney('cash_available', 'Cash Available', 'Bank / Capital free cash');

  const salonTodayPaise =
    salon.revenuePaise.lineage.find((l) => l.label === 'Today')?.paise ?? 0;
  const pgTodayPaise = billingOps?.kpis.collectedTodayPaise ?? 0;
  const todayIncomePaise = pgTodayPaise + salonTodayPaise;

  const todayIncome = moneyValue({
    id: 'today_income',
    label: "Today's Income",
    paise: todayIncomePaise,
    brain: 'personal_finance',
    engine: 'personal_finance',
    calculation: 'PG collected today + Salon revenue today',
    sourceApi: 'loadBillingOperationsDashboard + getRevenueDashboardSnapshot',
    connected: pg.available || salon.available,
    lineage: [
      { label: 'PG collected today', paise: pgTodayPaise },
      { label: 'Salon today', paise: salonTodayPaise },
    ],
  });

  const yearlyProfitPaise = Number(capitalKpis?.yearlyProfitPaise ?? 0) || 0;
  const yearlyProfit = moneyValue({
    id: 'yearly_profit',
    label: 'Yearly Profit',
    paise: yearlyProfitPaise,
    brain: 'personal_finance',
    engine: 'automotive_capital',
    calculation: 'getDealershipReportKpis().yearlyProfitPaise (+ Capital engines)',
    sourceApi: 'getDealershipReportKpis',
    connected: capital.available,
    lineage: [{ label: 'Yearly profit (entitled)', paise: yearlyProfitPaise }],
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
    connected:
      businessProfit.connected !== false
        ? businessProfit.connected
        : businessRevenue.connected !== false,
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
    connected: pg.available,
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
    connected: capital.available,
    lineage: [
      {
        label: capital.revenuePaise.label,
        paise: capital.revenuePaise.paise,
        ref: capital.revenuePaise.id,
      },
    ],
  });

  const cashflow = moneyValue({
    id: 'cashflow',
    label: 'Cashflow',
    paise: businessRevenue.paise - businessExpenses.paise,
    brain: 'personal_finance',
    engine: 'personal_finance',
    calculation: 'business_revenue − business_expenses (same as business_profit for now)',
    sourceApi: 'personalFinanceBrain.compose',
    connected: businessProfit.connected !== false,
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
    connected: pg.available && businessRevenue.connected !== false,
    lineage: [
      { label: 'PG revenue', paise: pg.revenuePaise.paise },
      { label: 'Total business revenue', paise: businessRevenue.paise },
    ],
  });

  const roiPct =
    capital.available &&
    vehiclePortfolio.connected !== false &&
    vehiclePortfolio.paise > 0
      ? percentValue({
          id: 'roi_pct',
          label: 'ROI',
          percent:
            Math.round((capital.revenuePaise.paise * 10000) / vehiclePortfolio.paise) / 100,
          brain: 'personal_finance',
          engine: 'automotive_capital',
          calculation: '(capital monthly profit ÷ vehicle portfolio) × 100',
          sourceApi: 'getDealershipReportKpis',
          connected: true,
          lineage: [
            { label: 'Monthly profit', paise: capital.revenuePaise.paise },
            { label: 'Portfolio', paise: vehiclePortfolio.paise },
          ],
        })
      : notConnectedPercent('roi_pct', 'ROI', 'Capital portfolio ROI');

  const profitTrendPct = notConnectedPercent('profit_trend_pct', 'Profit Trend', 'Trend Engine');

  const netWorthTrendPct = notConnectedPercent(
    'net_worth_trend_pct',
    'Net Worth Trend',
    'Trend Engine',
  );

  const burnPaise =
    businessExpenses.paise > 0 ? businessExpenses.paise : monthlyIncome.paise;
  const burnConnected =
    businessExpenses.paise > 0
      ? businessExpenses.connected !== false
      : monthlyIncome.connected !== false;

  const fi = financialIndependencePercent({
    passiveIncomePaise: passiveIncome.paise,
    monthlyBurnPaise: burnPaise,
    passiveConnected: passiveIncome.connected !== false,
    burnConnected,
  });

  const metrics: ExplainableValue[] = [
    currentNetWorth,
    cashAvailable,
    bankBalance,
    todayIncome,
    todayExpenses,
    todayProfit,
    businessRevenue,
    businessExpenses,
    businessProfit,
    monthlyIncome,
    yearlyProfit,
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
    upcomingPayments,
    upcomingEmis,
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

  const connectedMetrics = metrics.filter((m) => m.connected !== false);
  const connectLater = metrics.filter((m) => m.connected === false);

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
    connectedMetrics,
    connectLater,
    todayIncome,
    todayExpenses,
    todayProfit,
    yearlyProfit,
    upcomingPayments,
    upcomingEmis,
  };
}

export function explainMetric(
  snapshot: PersonalFinanceSnapshot,
  metricId: string,
): ExplainableValue | null {
  return findMetric(snapshot.metrics, metricId) ?? null;
}

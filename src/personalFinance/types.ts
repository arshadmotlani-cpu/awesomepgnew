/**
 * Personal Finance OS — explainable money primitives.
 * Every displayed number carries brain / engine / calculation / lineage.
 */

export type FinanceBrainId =
  | 'personal_finance'
  | 'finance'
  | 'owner'
  | 'employee'
  | 'health';

export type FinanceEngineId =
  | 'awesome_pg'
  | 'fyh_salon'
  | 'automotive_capital'
  | 'workforce'
  | 'personal_finance'
  | 'unconnected';

export type ExplainLineageItem = {
  label: string;
  paise?: number;
  ref?: string;
};

export type ExplainableValue = {
  id: string;
  label: string;
  paise: number;
  /** When kind is percent, paise is unused; use ratioBps (basis points) or percent */
  kind: 'money' | 'percent' | 'ratio';
  percent?: number;
  brain: FinanceBrainId;
  engine: FinanceEngineId;
  /** Human-readable calculation */
  calculation: string;
  /** Public API / service that supplied inputs */
  sourceApi: string;
  lineage: ExplainLineageItem[];
  /** true when placeholder until Engine connected */
  provisional?: boolean;
  /** false → UI shows "Not Connected" instead of ₹0 */
  connected?: boolean;
};

export type EngineContribution = {
  engine: FinanceEngineId;
  label: string;
  revenuePaise: ExplainableValue;
  expensesPaise: ExplainableValue;
  profitPaise: ExplainableValue;
  assetsPaise: ExplainableValue;
  liabilitiesPaise: ExplainableValue;
  available: boolean;
  error?: string;
};

export type PersonalFinanceSnapshot = {
  asOf: string;
  currentNetWorth: ExplainableValue;
  cashAvailable: ExplainableValue;
  bankBalance: ExplainableValue;
  businessRevenue: ExplainableValue;
  businessExpenses: ExplainableValue;
  businessProfit: ExplainableValue;
  monthlyIncome: ExplainableValue;
  quarterlyIncome: ExplainableValue;
  yearlyIncome: ExplainableValue;
  dailyIncome: ExplainableValue;
  hourlyIncome: ExplainableValue;
  recurringIncome: ExplainableValue;
  passiveIncome: ExplainableValue;
  assets: ExplainableValue;
  liabilities: ExplainableValue;
  loans: ExplainableValue;
  emis: ExplainableValue;
  insurance: ExplainableValue;
  investmentValue: ExplainableValue;
  propertyValue: ExplainableValue;
  vehiclePortfolio: ExplainableValue;
  cashflow: ExplainableValue;
  profitTrendPct: ExplainableValue;
  netWorthTrendPct: ExplainableValue;
  roiPct: ExplainableValue;
  businessContributionPct: ExplainableValue;
  financialIndependencePct: ExplainableValue;
  contributions: EngineContribution[];
  metrics: ExplainableValue[];
  /** Headline metrics with live Engine data */
  connectedMetrics: ExplainableValue[];
  /** Metrics awaiting future Engine connectors */
  connectLater: ExplainableValue[];
  todayIncome: ExplainableValue;
  todayExpenses: ExplainableValue;
  todayProfit: ExplainableValue;
  yearlyProfit: ExplainableValue;
  upcomingPayments: ExplainableValue;
  upcomingEmis: ExplainableValue;
};

export function isPersonalFinanceOsEnabled(): boolean {
  const raw = process.env.PERSONAL_FINANCE_OS;
  if (raw === undefined || raw.trim() === '') return true;
  const v = raw.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return v === '1' || v === 'true' || v === 'on';
}

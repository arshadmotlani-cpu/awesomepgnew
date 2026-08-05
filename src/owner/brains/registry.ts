/**
 * Owner OS Brain Registry — Engine-local catalog (ecosystem registry remains global SSOT).
 * Phase 1: shells that consume Personal Finance / public Engine APIs only.
 */

export type OwnerOsBrainStatus = 'planned' | 'partial' | 'live';

export type OwnerOsBrainEntry = {
  id: string;
  name: string;
  status: OwnerOsBrainStatus;
  owns: string;
  publicApi: string[];
  modulePath: string;
};

export const OWNER_OS_BRAIN_REGISTRY: OwnerOsBrainEntry[] = [
  {
    id: 'owner',
    name: 'Owner Brain',
    status: 'partial',
    owns: 'Life command projection · attention composition',
    publicApi: ['getOwnerLifeDashboard', 'getOwnerOsSnapshot'],
    modulePath: 'src/owner/brains/ownerBrain.ts',
  },
  {
    id: 'personal_finance',
    name: 'Personal Finance Brain',
    status: 'partial',
    owns: 'Explainable life metrics composition',
    publicApi: ['getPersonalFinanceSnapshot', 'explainMetric'],
    modulePath: 'src/personalFinance/brains/personalFinanceBrain.ts',
  },
  {
    id: 'net_worth',
    name: 'Net Worth Brain',
    status: 'partial',
    owns: 'Assets − liabilities projection from Personal Finance',
    publicApi: ['getNetWorthSnapshot'],
    modulePath: 'src/owner/brains/netWorthBrain.ts',
  },
  {
    id: 'asset',
    name: 'Asset Brain',
    status: 'planned',
    owns: 'Cross-engine asset catalog',
    publicApi: ['getAssetPosition (future)'],
    modulePath: 'src/owner/brains/stubs.ts',
  },
  {
    id: 'liability',
    name: 'Liability Brain',
    status: 'planned',
    owns: 'Loans · EMIs · payables',
    publicApi: ['getLiabilityPosition (future)'],
    modulePath: 'src/owner/brains/stubs.ts',
  },
  {
    id: 'cashflow',
    name: 'Cashflow Brain',
    status: 'planned',
    owns: 'Inflow/outflow timeline',
    publicApi: ['getCashflow (future)'],
    modulePath: 'src/owner/brains/stubs.ts',
  },
  {
    id: 'forecast',
    name: 'Forecast Brain',
    status: 'planned',
    owns: 'Projected net worth / cash',
    publicApi: ['getForecast (future)'],
    modulePath: 'src/owner/brains/stubs.ts',
  },
  {
    id: 'wealth',
    name: 'Wealth Brain',
    status: 'planned',
    owns: 'FI · emergency fund · liquidity ratios',
    publicApi: ['getWealthHealth (future)'],
    modulePath: 'src/owner/brains/stubs.ts',
  },
  {
    id: 'tax',
    name: 'Tax Brain',
    status: 'planned',
    owns: 'Tax position (consume only)',
    publicApi: ['getTaxPosition (future)'],
    modulePath: 'src/owner/brains/stubs.ts',
  },
  {
    id: 'investment',
    name: 'Investment Brain',
    status: 'partial',
    owns: 'Vehicle / portfolio investment view via Capital public KPIs',
    publicApi: ['getInvestmentSlice (via Personal Finance)'],
    modulePath: 'src/owner/brains/investmentBrain.ts',
  },
];

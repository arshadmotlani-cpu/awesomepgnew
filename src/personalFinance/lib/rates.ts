/**
 * Rate derivations owned by Personal Finance Brain (from already-resolved monthly income).
 * Does not recompute Engine revenue.
 */
import { notConnectedMoney } from '@/src/personalFinance/adapters/unconnected';
import { moneyValue, percentValue } from '@/src/personalFinance/explain';
import type { ExplainableValue } from '@/src/personalFinance/types';

const DAYS_PER_MONTH = 30;
const HOURS_PER_DAY = 8; // working-hour FI framing

export function deriveIncomeRates(monthlyIncome: ExplainableValue): {
  quarterly: ExplainableValue;
  yearly: ExplainableValue;
  daily: ExplainableValue;
  hourly: ExplainableValue;
} {
  if (monthlyIncome.connected === false) {
    return {
      quarterly: notConnectedMoney('quarterly_income', 'Quarterly Income', 'monthly_income dependency'),
      yearly: notConnectedMoney('yearly_income', 'Yearly Income', 'monthly_income dependency'),
      daily: notConnectedMoney('daily_income', 'Daily Income', 'monthly_income dependency'),
      hourly: notConnectedMoney('hourly_income', 'Hourly Income', 'monthly_income dependency'),
    };
  }

  const m = monthlyIncome.paise;
  return {
    quarterly: moneyValue({
      id: 'quarterly_income',
      label: 'Quarterly Income (est.)',
      paise: m * 3,
      brain: 'personal_finance',
      engine: 'personal_finance',
      calculation: `monthly_income × 3 = ${m} × 3`,
      sourceApi: 'personalFinance.deriveIncomeRates',
      connected: true,
      lineage: [{ label: monthlyIncome.label, paise: m, ref: monthlyIncome.id }],
    }),
    yearly: moneyValue({
      id: 'yearly_income',
      label: 'Yearly Income (est.)',
      paise: m * 12,
      brain: 'personal_finance',
      engine: 'personal_finance',
      calculation: `monthly_income × 12 = ${m} × 12`,
      sourceApi: 'personalFinance.deriveIncomeRates',
      connected: true,
      lineage: [{ label: monthlyIncome.label, paise: m, ref: monthlyIncome.id }],
    }),
    daily: moneyValue({
      id: 'daily_income',
      label: 'Daily Income (est.)',
      paise: Math.floor(m / DAYS_PER_MONTH),
      brain: 'personal_finance',
      engine: 'personal_finance',
      calculation: `monthly_income ÷ ${DAYS_PER_MONTH}`,
      sourceApi: 'personalFinance.deriveIncomeRates',
      connected: true,
      lineage: [{ label: monthlyIncome.label, paise: m, ref: monthlyIncome.id }],
    }),
    hourly: moneyValue({
      id: 'hourly_income',
      label: 'Hourly Income (est.)',
      paise: Math.floor(m / (DAYS_PER_MONTH * HOURS_PER_DAY)),
      brain: 'personal_finance',
      engine: 'personal_finance',
      calculation: `monthly_income ÷ (${DAYS_PER_MONTH} × ${HOURS_PER_DAY} working hours)`,
      sourceApi: 'personalFinance.deriveIncomeRates',
      connected: true,
      lineage: [{ label: monthlyIncome.label, paise: m, ref: monthlyIncome.id }],
    }),
  };
}

/** FI% = passive_income / monthly_expenses target. */
export function financialIndependencePercent(input: {
  passiveIncomePaise: number;
  monthlyBurnPaise: number;
  passiveConnected: boolean;
  burnConnected: boolean;
}): ExplainableValue {
  if (!input.passiveConnected || !input.burnConnected || input.monthlyBurnPaise <= 0) {
    return percentValue({
      id: 'financial_independence_pct',
      label: 'Financial Independence %',
      percent: 0,
      brain: 'personal_finance',
      engine: 'personal_finance',
      calculation: 'Requires connected passive income and burn baseline',
      sourceApi: 'personalFinance.financialIndependencePercent',
      connected: false,
      lineage: [],
    });
  }

  const burn = input.monthlyBurnPaise;
  const passive = Math.max(0, input.passiveIncomePaise);
  const pct = Math.min(100, Math.floor((passive * 100) / burn));
  return percentValue({
    id: 'financial_independence_pct',
    label: 'Financial Independence %',
    percent: pct,
    brain: 'personal_finance',
    engine: 'personal_finance',
    calculation: `(passive_income ÷ monthly_burn) × 100 = (${passive} ÷ ${burn}) × 100`,
    sourceApi: 'personalFinance.financialIndependencePercent',
    connected: true,
    lineage: [
      { label: 'Passive income', paise: passive },
      { label: 'Monthly burn baseline', paise: burn },
    ],
  });
}

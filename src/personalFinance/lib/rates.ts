/**
 * Rate derivations owned by Personal Finance Brain (from already-resolved monthly income).
 * Does not recompute Engine revenue.
 */
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
  const m = monthlyIncome.paise;
  return {
    quarterly: moneyValue({
      id: 'quarterly_income',
      label: 'Quarterly Income',
      paise: m * 3,
      brain: 'personal_finance',
      engine: 'personal_finance',
      calculation: `monthly_income × 3 = ${m} × 3`,
      sourceApi: 'personalFinance.deriveIncomeRates',
      lineage: [{ label: monthlyIncome.label, paise: m, ref: monthlyIncome.id }],
    }),
    yearly: moneyValue({
      id: 'yearly_income',
      label: 'Yearly Income',
      paise: m * 12,
      brain: 'personal_finance',
      engine: 'personal_finance',
      calculation: `monthly_income × 12 = ${m} × 12`,
      sourceApi: 'personalFinance.deriveIncomeRates',
      lineage: [{ label: monthlyIncome.label, paise: m, ref: monthlyIncome.id }],
    }),
    daily: moneyValue({
      id: 'daily_income',
      label: 'Daily Income',
      paise: Math.floor(m / DAYS_PER_MONTH),
      brain: 'personal_finance',
      engine: 'personal_finance',
      calculation: `monthly_income ÷ ${DAYS_PER_MONTH}`,
      sourceApi: 'personalFinance.deriveIncomeRates',
      lineage: [{ label: monthlyIncome.label, paise: m, ref: monthlyIncome.id }],
    }),
    hourly: moneyValue({
      id: 'hourly_income',
      label: 'Hourly Income',
      paise: Math.floor(m / (DAYS_PER_MONTH * HOURS_PER_DAY)),
      brain: 'personal_finance',
      engine: 'personal_finance',
      calculation: `monthly_income ÷ (${DAYS_PER_MONTH} × ${HOURS_PER_DAY} working hours)`,
      sourceApi: 'personalFinance.deriveIncomeRates',
      lineage: [{ label: monthlyIncome.label, paise: m, ref: monthlyIncome.id }],
    }),
  };
}

/** FI% = passive_income / monthly_expenses target; expenses unknown → use business profit coverage of living stub. */
export function financialIndependencePercent(input: {
  passiveIncomePaise: number;
  monthlyBurnPaise: number;
}): ExplainableValue {
  const burn = Math.max(0, input.monthlyBurnPaise);
  const passive = Math.max(0, input.passiveIncomePaise);
  const pct = burn <= 0 ? 0 : Math.min(100, Math.floor((passive * 100) / burn));
  return percentValue({
    id: 'financial_independence_pct',
    label: 'Financial Independence %',
    percent: pct,
    brain: 'personal_finance',
    engine: 'personal_finance',
    calculation:
      burn <= 0
        ? 'No burn baseline connected — 0%'
        : `(passive_income ÷ monthly_burn) × 100 = (${passive} ÷ ${burn}) × 100`,
    sourceApi: 'personalFinance.financialIndependencePercent',
    lineage: [
      { label: 'Passive income', paise: passive },
      { label: 'Monthly burn baseline', paise: burn },
    ],
    provisional: burn <= 0,
  });
}

/**
 * Workforce salary liability as owner expense contribution (consume connector only).
 */
import { getWorkforceFinanceContribution } from '@/src/workforce/connectors/financeBridge';
import { moneyValue } from '@/src/personalFinance/explain';
import type { EngineContribution } from '@/src/personalFinance/types';

export async function loadWorkforceContribution(): Promise<EngineContribution> {
  try {
    const snap = await getWorkforceFinanceContribution('fyh_salon');
    const salary = snap.monthlySalaryLiabilityPaise;
    const incentives = snap.pendingIncentivePaise;

    return {
      engine: 'workforce',
      label: 'Workforce (payroll liability)',
      available: true,
      revenuePaise: moneyValue({
        id: 'wf_revenue',
        label: 'Workforce revenue',
        paise: 0,
        brain: 'employee',
        engine: 'workforce',
        calculation: 'Workforce does not produce owner revenue',
        sourceApi: 'getWorkforceFinanceContribution',
        lineage: [],
      }),
      expensesPaise: moneyValue({
        id: 'wf_salary_liability',
        label: 'Monthly salary + pending incentives',
        paise: salary + incentives,
        brain: 'employee',
        engine: 'workforce',
        calculation: 'monthlySalaryLiabilityPaise + pendingIncentivePaise',
        sourceApi: 'getWorkforceFinanceContribution',
        lineage: [
          { label: 'Salary liability', paise: salary },
          { label: 'Pending incentives', paise: incentives },
        ],
      }),
      profitPaise: moneyValue({
        id: 'wf_profit_impact',
        label: 'Workforce P&L impact',
        paise: -(salary + incentives),
        brain: 'personal_finance',
        engine: 'workforce',
        calculation: '−(salary + incentives)',
        sourceApi: 'personalFinance.adapters.workforce',
        lineage: [
          { label: 'Salary', paise: salary },
          { label: 'Incentives', paise: incentives },
        ],
      }),
      assetsPaise: moneyValue({
        id: 'wf_assets',
        label: 'Workforce assets',
        paise: 0,
        brain: 'employee',
        engine: 'workforce',
        calculation: 'n/a',
        sourceApi: 'getWorkforceFinanceContribution',
        provisional: true,
        lineage: [],
      }),
      liabilitiesPaise: moneyValue({
        id: 'wf_liabilities',
        label: 'Payroll liabilities',
        paise: salary + incentives,
        brain: 'employee',
        engine: 'workforce',
        calculation: 'Same as monthly salary + incentives pending',
        sourceApi: 'getWorkforceFinanceContribution',
        lineage: [
          { label: 'Salary', paise: salary },
          { label: 'Incentives', paise: incentives },
        ],
      }),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Workforce adapter failed';
    const zero = (id: string, label: string) =>
      moneyValue({
        id,
        label,
        paise: 0,
        brain: 'employee',
        engine: 'workforce',
        calculation: msg,
        sourceApi: 'getWorkforceFinanceContribution',
        provisional: true,
      });
    return {
      engine: 'workforce',
      label: 'Workforce',
      available: false,
      error: msg,
      revenuePaise: zero('wf_revenue', 'Workforce revenue'),
      expensesPaise: zero('wf_salary_liability', 'Salary liability'),
      profitPaise: zero('wf_profit_impact', 'Workforce P&L impact'),
      assetsPaise: zero('wf_assets', 'Workforce assets'),
      liabilitiesPaise: zero('wf_liabilities', 'Payroll liabilities'),
    };
  }
}

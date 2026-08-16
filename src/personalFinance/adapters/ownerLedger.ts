/**
 * Owner Ledger adapter — feeds Personal Finance Brain from Owner DB wealth services.
 */
import { loadCapitalContribution } from '@/src/personalFinance/adapters/capital';
import { moneyValue } from '@/src/personalFinance/explain';
import type { EngineContribution } from '@/src/personalFinance/types';
import { getWealthSnapshot } from '@/src/owner/services/wealthCalculation';

export type OwnerLedgerContribution = {
  bankBalancePaise: number;
  propertyValuePaise: number;
  loansPaise: number;
  monthlyExpensesPaise: number;
  monthlyIncomePaise: number;
  netWorthPaise: number;
  available: boolean;
  error?: string;
};

export async function loadOwnerLedgerContribution(): Promise<OwnerLedgerContribution> {
  try {
    const capital = await loadCapitalContribution();
    const investmentValuePaise = capital.assetsPaise.paise;

    const wealth = await getWealthSnapshot({ investmentValuePaise });

    return {
      bankBalancePaise: wealth.bankBalancePaise,
      propertyValuePaise: wealth.propertyValuePaise,
      loansPaise: wealth.totalLiabilitiesPaise,
      monthlyExpensesPaise: wealth.cashFlow.month.expensePaise,
      monthlyIncomePaise: wealth.cashFlow.month.incomePaise,
      netWorthPaise: wealth.netWorthPaise,
      available: true,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Owner ledger unavailable';
    return {
      bankBalancePaise: 0,
      propertyValuePaise: 0,
      loansPaise: 0,
      monthlyExpensesPaise: 0,
      monthlyIncomePaise: 0,
      netWorthPaise: 0,
      available: false,
      error: msg,
    };
  }
}

export async function loadOwnerLedgerEngineContribution(): Promise<EngineContribution> {
  const ledger = await loadOwnerLedgerContribution();

  const zero = (id: string, label: string) =>
    moneyValue({
      id,
      label,
      paise: 0,
      brain: 'owner',
      engine: 'personal_finance',
      calculation: ledger.error ?? 'Owner ledger unavailable',
      sourceApi: 'ownerLedger',
      provisional: true,
      connected: false,
    });

  if (!ledger.available) {
    return {
      engine: 'personal_finance',
      label: 'Owner Ledger',
      available: false,
      error: ledger.error,
      revenuePaise: zero('owner_ledger_income', 'Owner ledger income'),
      expensesPaise: zero('owner_ledger_expenses', 'Owner ledger expenses'),
      profitPaise: zero('owner_ledger_profit', 'Owner ledger profit'),
      assetsPaise: zero('owner_ledger_assets', 'Owner ledger assets'),
      liabilitiesPaise: zero('owner_ledger_liabilities', 'Owner ledger liabilities'),
    };
  }

  return {
    engine: 'personal_finance',
    label: 'Owner Ledger',
    available: true,
    revenuePaise: moneyValue({
      id: 'owner_ledger_income',
      label: 'Owner ledger income (MTD)',
      paise: ledger.monthlyIncomePaise,
      brain: 'owner',
      engine: 'personal_finance',
      calculation: 'Σ journal income + integration facts (MTD)',
      sourceApi: 'wealthCalculation.getWealthSnapshot',
      connected: true,
      lineage: [{ label: 'MTD income', paise: ledger.monthlyIncomePaise }],
    }),
    expensesPaise: moneyValue({
      id: 'owner_ledger_expenses',
      label: 'Owner ledger expenses (MTD)',
      paise: ledger.monthlyExpensesPaise,
      brain: 'owner',
      engine: 'personal_finance',
      calculation: 'Σ journal expenses + integration facts (MTD)',
      sourceApi: 'wealthCalculation.getWealthSnapshot',
      connected: true,
      lineage: [{ label: 'MTD expenses', paise: ledger.monthlyExpensesPaise }],
    }),
    profitPaise: moneyValue({
      id: 'owner_ledger_profit',
      label: 'Owner ledger net cash flow (MTD)',
      paise: ledger.monthlyIncomePaise - ledger.monthlyExpensesPaise,
      brain: 'owner',
      engine: 'personal_finance',
      calculation: 'owner_income − owner_expenses',
      sourceApi: 'wealthCalculation.getWealthSnapshot',
      connected: true,
      lineage: [
        { label: 'Income', paise: ledger.monthlyIncomePaise },
        { label: 'Expenses', paise: ledger.monthlyExpensesPaise },
      ],
    }),
    assetsPaise: moneyValue({
      id: 'owner_ledger_assets',
      label: 'Owner ledger assets',
      paise: ledger.bankBalancePaise + ledger.propertyValuePaise,
      brain: 'owner',
      engine: 'personal_finance',
      calculation: 'bank + property (owner-attributed)',
      sourceApi: 'wealthCalculation.getWealthSnapshot',
      connected: true,
      lineage: [
        { label: 'Bank', paise: ledger.bankBalancePaise },
        { label: 'Property', paise: ledger.propertyValuePaise },
      ],
    }),
    liabilitiesPaise: moneyValue({
      id: 'owner_ledger_liabilities',
      label: 'Owner ledger liabilities',
      paise: ledger.loansPaise,
      brain: 'owner',
      engine: 'personal_finance',
      calculation: 'Σ liability principal + accrued interest',
      sourceApi: 'liabilities.getTotalLiabilityPaise',
      connected: true,
      lineage: [{ label: 'Loans', paise: ledger.loansPaise }],
    }),
  };
}

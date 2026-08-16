import { ExpensesUi } from '@/src/owner/components/wealth/ExpensesUi';
import { getAccountsWithBalancesResolved } from '@/src/owner/services/financialAccounts';
import { listExpensesWithSource } from '@/src/owner/services/journal';
import { getWealthSnapshot } from '@/src/owner/services/wealthCalculation';
import { coerceWealthPaise } from '@/src/owner/lib/wealth/paiseCoercion';

export default async function OwnerExpensesPage() {
  const [expenses, accounts, wealth] = await Promise.all([
    listExpensesWithSource({ limit: 100 }).catch(() => []),
    getAccountsWithBalancesResolved().catch(() => []),
    getWealthSnapshot().catch(() => null),
  ]);

  return (
    <ExpensesUi
      expenses={expenses.map((e) => ({
        id: e.id,
        entryDate: e.entryDate,
        description: e.description,
        sourceSystem: e.sourceSystem,
        amountPaise: coerceWealthPaise(e.amountPaise),
        category: e.category,
        notes: e.notes,
      }))}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      expensesBySource={(wealth?.expensesBySource ?? []).map((r) => ({
        sourceSystem: r.sourceSystem,
        totalPaise: coerceWealthPaise(r.totalPaise),
      }))}
    />
  );
}

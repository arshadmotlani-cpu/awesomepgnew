import { ExpensesPageUi } from '@/src/hair/components/expenses/ExpensesUi';
import { ExpensesSectionSubNav } from '@/src/hair/components/expenses/ExpensesSectionSubNav';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import { listExpenses } from '@/src/hair/services/expenses';

export default async function ExpensesPage() {
  const ctx = await getTenantContextForPage();
  const [expenses, session] = await Promise.all([listExpenses(200, ctx), getHairSession()]);
  const staffName = session?.admin.displayName ?? 'Staff';

  return (
    <>
      <ExpensesSectionSubNav />
      <ExpensesPageUi expenses={expenses} staffName={staffName} />
    </>
  );
}

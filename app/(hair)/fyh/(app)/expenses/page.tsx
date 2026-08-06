import { ExpensesPageUi } from '@/src/hair/components/expenses/ExpensesUi';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { listExpenses } from '@/src/hair/services/expenses';

export default async function ExpensesPage() {
  const [expenses, session] = await Promise.all([listExpenses(), getHairSession()]);
  const staffName = session?.admin.displayName ?? 'Staff';

  return <ExpensesPageUi expenses={expenses} staffName={staffName} />;
}

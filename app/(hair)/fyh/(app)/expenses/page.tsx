import { ExpensesPageUi } from '@/src/hair/components/expenses/ExpensesUi';
import { ExpensesSectionSubNav } from '@/src/hair/components/expenses/ExpensesSectionSubNav';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import {
  listGeneralExpenses,
  parseExpenseListFiltersFromSearchParams,
} from '@/src/hair/services/expenses';
import { listStaff } from '@/src/hair/services/staff';
import { requireFyhPermission, sessionHasPermission } from '@/src/workforce/permissions/guards';

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireFyhPermission({ permission: 'expenses.general.view', scope: 'org' });
  const ctx = await getTenantContextForPage();
  const params = await searchParams;
  const filters = parseExpenseListFiltersFromSearchParams(params);
  const [list, session, staffRows, canAdd, canEdit, canSalary] = await Promise.all([
    listGeneralExpenses(filters, ctx),
    getHairSession(),
    listStaff(false, ctx),
    sessionHasPermission('expenses.general.add'),
    sessionHasPermission('expenses.general.edit'),
    sessionHasPermission('expenses.salary.view'),
  ]);
  const staffName = session?.admin.displayName ?? 'Staff';
  const staffOptions = staffRows.map((s) => ({ id: s.id, name: s.fullName }));
  const staffNameById = Object.fromEntries(staffOptions.map((s) => [s.id, s.name]));

  return (
    <>
      <ExpensesSectionSubNav showGeneral showSalary={canSalary} />
      <ExpensesPageUi
        list={list}
        staffName={staffName}
        staffOptions={staffOptions}
        staffNameById={staffNameById}
        canAdd={canAdd}
        canEdit={canEdit}
      />
    </>
  );
}

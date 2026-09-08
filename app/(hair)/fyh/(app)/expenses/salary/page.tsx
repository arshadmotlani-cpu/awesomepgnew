import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireHairHost } from '@/src/hair/lib/auth/guards';
import { ExpensesSectionSubNav } from '@/src/hair/components/expenses/ExpensesSectionSubNav';
import { SalaryEmployeeCard } from '@/src/workforce/components/payroll/SalaryEmployeeCard';
import { loadStaffPayrollPage } from '@/src/workforce/actions/payroll';
import { defaultPayrollMonthKey, payrollPeriodLabel } from '@/src/workforce/lib/payrollAvailability';
import { getSalonSettings } from '@/src/hair/services/settings';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';

export default async function ExpensesSalaryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireHairHost();
  if (!isWorkforceEngineEnabled()) redirect('/expenses');

  const params = await searchParams;
  const settings = await getSalonSettings();
  const timezone = settings.timezone ?? 'Asia/Kolkata';
  const defaultMonth = defaultPayrollMonthKey(timezone);
  const monthKey = params.month ?? defaultMonth;

  const { line, canTeam } = await loadStaffPayrollPage(monthKey);

  if (canTeam) {
    const { loadOwnerPayrollPage } = await import('@/src/workforce/actions/payroll');
    const { OwnerSalaryPageClient } = await import(
      '@/src/workforce/components/payroll/OwnerSalaryPageClient'
    );
    const { detail } = await loadOwnerPayrollPage(monthKey);
    return (
      <>
        <ExpensesSectionSubNav />
        <OwnerSalaryPageClient detail={detail} />
      </>
    );
  }

  const monthLabel = payrollPeriodLabel(monthKey);

  return (
    <>
      <ExpensesSectionSubNav />
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <p className="fyh-section-eyebrow">Finance</p>
          <h1 className="fyh-display mt-1 font-semibold">My salary</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Your attendance-based salary for the selected month.
          </p>
        </header>

        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Month
            <input
              name="month"
              type="month"
              defaultValue={monthKey}
              className="ml-2 rounded border border-[color:var(--fyh-border)] bg-transparent px-2 py-1"
            />
          </label>
          <button type="submit" className="rounded border border-[color:var(--fyh-border)] px-3 py-2 text-sm">
            Apply
          </button>
        </form>

        {line ? (
          <SalaryEmployeeCard line={line} monthLabel={monthLabel} ownerView={false} />
        ) : (
          <p className="text-sm text-fyh-text-secondary">No salary record for this period.</p>
        )}

        <p className="text-center text-sm">
          <Link href="/attendance" className="text-fyh-accent underline">
            View my attendance
          </Link>
        </p>
      </div>
    </>
  );
}

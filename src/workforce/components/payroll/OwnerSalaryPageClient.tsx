'use client';

import { SalaryEmployeeCard } from '@/src/workforce/components/payroll/SalaryEmployeeCard';
import type { PayrollRunDetail } from '@/src/workforce/services/payroll';
import { payrollAvailabilityLabel, payrollPeriodLabel } from '@/src/workforce/lib/payrollAvailability';
import { formatInrFromPaise } from '@/src/hair/lib/money';

type Props = {
  detail: PayrollRunDetail;
};

export function OwnerSalaryPageClient({ detail }: Props) {
  const monthLabel = payrollPeriodLabel(detail.monthKey);

  return (
    <div className="space-y-6">
      <header>
        <p className="fyh-section-eyebrow">Finance</p>
        <h1 className="fyh-display mt-1 font-semibold">Salary</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          {payrollAvailabilityLabel({ periodStart: detail.periodStart, periodEnd: detail.periodEnd })}
        </p>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-4">
        <label className="text-sm">
          Month
          <input
            name="month"
            type="month"
            defaultValue={detail.monthKey}
            className="ml-2 rounded border border-[color:var(--fyh-border)] bg-transparent px-2 py-1"
          />
        </label>
        <button type="submit" className="rounded border border-[color:var(--fyh-border)] px-3 py-2 text-sm">
          Apply
        </button>
      </form>

      <section className="grid gap-3 rounded-xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <p className="text-fyh-text-secondary">Employees</p>
          <p className="text-lg font-semibold">{detail.employeeCount}</p>
        </div>
        <div>
          <p className="text-fyh-text-secondary">Total salary</p>
          <p className="font-semibold">{formatInrFromPaise(detail.totalSalaryPaise)}</p>
        </div>
        <div>
          <p className="text-fyh-text-secondary">Incentives</p>
          <p className="font-semibold">{formatInrFromPaise(detail.totalIncentivePaise)}</p>
        </div>
        <div>
          <p className="text-fyh-text-secondary">Deductions</p>
          <p className="font-semibold">{formatInrFromPaise(detail.totalDeductionsPaise)}</p>
        </div>
        <div>
          <p className="text-fyh-text-secondary">Net payable</p>
          <p className="font-semibold">{formatInrFromPaise(detail.netPayablePaise)}</p>
        </div>
        <div>
          <p className="text-fyh-text-secondary">Paid / Pending</p>
          <p className="font-semibold">
            {formatInrFromPaise(detail.paidPaise)} / {formatInrFromPaise(detail.pendingPaise)}
          </p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {detail.lines.map((line) => (
          <SalaryEmployeeCard key={line.lineId} line={line} monthLabel={monthLabel} ownerView />
        ))}
      </div>
    </div>
  );
}

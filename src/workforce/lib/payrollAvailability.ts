import { salonDayBounds } from '@/src/hair/lib/salonTime';
import { resolvePreviousMonthPeriod, type PayrollPeriod } from '@/src/workforce/lib/payrollPeriod';

/** Month key YYYY-MM → payroll period for that calendar month. */
export function payrollPeriodFromMonthKey(monthKey: string): PayrollPeriod {
  const [y, m] = monthKey.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    periodStart: `${monthKey}-01`,
    periodEnd: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** Default selected month = previous completed calendar month. */
export function defaultPayrollMonthKey(timezone = 'Asia/Kolkata', asOf = new Date()): string {
  return resolvePreviousMonthPeriod(timezone, asOf).periodStart.slice(0, 7);
}

/**
 * Salary for January becomes available on 1 February (first day after period end month).
 * Never expose current in-progress month as a final payroll period.
 */
export function isPayrollPeriodAvailable(
  period: PayrollPeriod,
  timezone = 'Asia/Kolkata',
  asOf = new Date(),
): boolean {
  const [ey, em] = period.periodEnd.split('-').map(Number);
  const nextMonth = em === 12 ? 1 : em + 1;
  const nextYear = em === 12 ? ey + 1 : ey;
  const availableFrom = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  const { dayKey } = salonDayBounds(timezone, asOf);
  return dayKey >= availableFrom;
}

export function payrollPeriodLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function payrollAvailabilityLabel(period: PayrollPeriod): string {
  const [ey, em, ed] = period.periodEnd.split('-').map(Number);
  const nextMonth = em === 12 ? 1 : em + 1;
  const nextYear = em === 12 ? ey + 1 : ey;
  return `Attendance period: 1 ${new Date(Date.UTC(ey, em - 1, 1)).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })} → ${ed} ${new Date(Date.UTC(ey, em - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })} · Available from 1 ${new Date(Date.UTC(nextYear, nextMonth - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
}

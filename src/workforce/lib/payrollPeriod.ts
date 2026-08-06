import { salonDayBounds } from '@/src/hair/lib/salonTime';
import { SALON_PAYROLL_RULES } from '@/src/workforce/lib/salonCompensationRules.constants';

export type PayrollPeriod = {
  periodStart: string;
  periodEnd: string;
};

/** Calendar day of month in salon timezone (1–31). */
export function salonDayOfMonth(timezone = 'Asia/Kolkata', now = new Date()): number {
  const { dayKey } = salonDayBounds(timezone, now);
  return Number(dayKey.split('-')[2]);
}

/** Previous calendar month [first, last] in YYYY-MM-DD (salon TZ reference day). */
export function resolvePreviousMonthPeriod(
  timezone = 'Asia/Kolkata',
  asOf = new Date(),
): PayrollPeriod {
  const { dayKey } = salonDayBounds(timezone, asOf);
  const [y, m] = dayKey.split('-').map(Number);
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  const periodStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  const periodEnd = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { periodStart, periodEnd };
}

/** Salary runs may only be generated between the 7th and 10th (inclusive). */
export function isPayrollGenerationWindowOpen(
  asOf = new Date(),
  timezone = 'Asia/Kolkata',
): boolean {
  const dom = salonDayOfMonth(timezone, asOf);
  return dom >= SALON_PAYROLL_RULES.generationStartDay && dom <= SALON_PAYROLL_RULES.generationEndDay;
}

/**
 * Employee is eligible for a payroll period if they joined on or before period end.
 * Joining mid-month still counts for that month (salary engine may prorate later).
 */
export function isEmployeeEligibleForPeriod(
  joiningDate: string | null | undefined,
  period: PayrollPeriod,
): boolean {
  if (!joiningDate) return true;
  return joiningDate <= period.periodEnd;
}

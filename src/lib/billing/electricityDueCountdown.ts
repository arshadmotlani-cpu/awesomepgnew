/**
 * Electricity payment deadline copy — due date only, no percentage late fee.
 */

import { diffDays, formatDate, type DateLike } from '@/src/lib/dates';

export type ElectricityDueCountdownState = {
  message: string;
  daysUntilDue: number;
  isOverdue: boolean;
};

export function buildElectricityDueCountdown(
  dueDate: DateLike,
  today: DateLike = formatDate(new Date()),
): ElectricityDueCountdownState {
  const daysUntilDue = diffDays(today, dueDate);
  if (daysUntilDue > 0) {
    const dayLabel = daysUntilDue === 1 ? 'day' : 'days';
    return {
      message: `Payment due in ${daysUntilDue} ${dayLabel}`,
      daysUntilDue,
      isOverdue: false,
    };
  }
  if (daysUntilDue === 0) {
    return { message: 'Payment due today', daysUntilDue: 0, isOverdue: false };
  }
  const overdueDays = -daysUntilDue;
  const overdueLabel = overdueDays === 1 ? '1 day overdue' : `${overdueDays} days overdue`;
  return {
    message: overdueLabel,
    daysUntilDue,
    isOverdue: true,
  };
}

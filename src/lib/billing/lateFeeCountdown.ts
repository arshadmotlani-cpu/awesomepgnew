/**
 * Dynamic late-fee countdown copy for resident bill pages.
 */

import {
  chargeableLateFeeDaysFromIssue,
  daysUntilLateFeeFromIssue,
  lateFeePercentFromIssue,
} from '@/src/lib/billing/lateFeeSchedule';
import type { DateLike } from '@/src/lib/dates';

export type LateFeeCountdownState =
  | { phase: 'grace'; message: string; daysUntilLateFee: number }
  | { phase: 'late'; message: string; percentToday: number; percentTomorrow: number };

export function buildLateFeeCountdown(
  issueDate: DateLike,
  today?: DateLike,
): LateFeeCountdownState {
  const chargeableDays = chargeableLateFeeDaysFromIssue(issueDate, today);
  if (chargeableDays === 0) {
    const daysUntil = daysUntilLateFeeFromIssue(issueDate, today);
    if (daysUntil === 0) {
      return {
        phase: 'grace',
        message: 'Due today',
        daysUntilLateFee: 0,
      };
    }
    const dayLabel = daysUntil === 1 ? 'day' : 'days';
    return {
      phase: 'grace',
      message: `Due in ${daysUntil} ${dayLabel}`,
      daysUntilLateFee: daysUntil,
    };
  }

  const overdueDays = chargeableDays;
  const overdueLabel = overdueDays === 1 ? '1 day overdue' : `${overdueDays} days overdue`;
  const percentToday = lateFeePercentFromIssue(issueDate, today);
  return {
    phase: 'late',
    message: `${overdueLabel} · Late fee ${percentToday}%`,
    percentToday,
    percentTomorrow: percentToday + 1,
  };
}

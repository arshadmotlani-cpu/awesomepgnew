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
        message: 'Last day to pay without late fee',
        daysUntilLateFee: 0,
      };
    }
    const dayLabel = daysUntil === 1 ? 'day' : 'days';
    return {
      phase: 'grace',
      message: `${daysUntil} ${dayLabel} left before late fee starts`,
      daysUntilLateFee: daysUntil,
    };
  }

  const percentToday = lateFeePercentFromIssue(issueDate, today);
  return {
    phase: 'late',
    message: `Late fee: ${percentToday}% applied`,
    percentToday,
    percentTomorrow: percentToday + 1,
  };
}

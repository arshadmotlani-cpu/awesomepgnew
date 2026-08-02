/**
 * Generation-date late fee schedule — pure helpers shared by billing + policy.
 */

import { addDays, diffDays, formatDate, normalizeIsoDateOnly, parseDate, type DateLike } from '@/src/lib/dates';

/** Inclusive grace days from invoice generation before late fees start. */
export const INVOICE_LATE_FEE_GRACE_DAYS = 5;

function normalizeIssueDate(issueDate: DateLike): string {
  if (issueDate instanceof Date) {
    return formatDate(issueDate);
  }
  const normalized = normalizeIsoDateOnly(String(issueDate));
  if (normalized) return normalized;
  return formatDate(parseDate(issueDate));
}

/** Last calendar day without late fee (generation + 4 days). */
export function graceEndDateFromIssue(issueDate: DateLike): Date {
  return addDays(normalizeIssueDate(issueDate), INVOICE_LATE_FEE_GRACE_DAYS - 1);
}

/** Chargeable late-fee days: 0 during grace, 1 on first day after grace, etc. */
export function chargeableLateFeeDaysFromIssue(issueDate: DateLike, today?: DateLike): number {
  const todayIso = today != null ? normalizeIssueDate(today) : formatDate(new Date());
  const graceEnd = formatDate(graceEndDateFromIssue(issueDate));
  return Math.max(0, diffDays(graceEnd, todayIso));
}

/** Days remaining before late fees start (0 on last grace day). */
export function daysUntilLateFeeFromIssue(issueDate: DateLike, today?: DateLike): number {
  const todayIso = today != null ? normalizeIssueDate(today) : formatDate(new Date());
  const graceEnd = formatDate(graceEndDateFromIssue(issueDate));
  return Math.max(0, diffDays(todayIso, graceEnd));
}

/** Late fee percent as of today (1% per chargeable day). */
export function lateFeePercentFromIssue(issueDate: DateLike, today?: DateLike): number {
  return chargeableLateFeeDaysFromIssue(issueDate, today);
}

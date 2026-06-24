import { formatDate, parseDate, type DateLike } from '@/src/lib/dates';

/** Invoice due date must never precede the issue (created) date. */
export function clampDueDateOnOrAfterIssueDate(
  dueDate: string,
  issueDate: string,
): string {
  return dueDate >= issueDate ? dueDate : issueDate;
}

function toIsoDate(value: DateLike): string {
  return formatDate(parseDate(value));
}

export function resolveRentInvoiceDueDate(input: {
  stayStart?: string | null;
  issueDate?: DateLike;
  explicitDueDate?: string | null;
}): string {
  const issue = toIsoDate(input.issueDate ?? new Date());
  if (input.explicitDueDate?.trim()) {
    return clampDueDateOnOrAfterIssueDate(input.explicitDueDate.trim(), issue);
  }
  if (input.stayStart?.trim()) {
    return clampDueDateOnOrAfterIssueDate(input.stayStart.trim(), issue);
  }
  return issue;
}

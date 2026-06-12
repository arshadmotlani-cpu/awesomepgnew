import { addDays, diffDays, formatDate, parseDate } from '@/src/lib/dates';

export type OpsPriority = 'red' | 'orange' | 'green';

export function formatPgDisplayName(pgName: string): string {
  const upper = pgName.trim().toUpperCase();
  if (upper.includes('AWESOME PG')) return upper;
  return `${upper} - AWESOME PG`;
}

export function vacatingPriority(daysRemaining: number): OpsPriority {
  if (daysRemaining <= 7) return 'red';
  if (daysRemaining <= 14) return 'orange';
  return 'green';
}

export function kycPriority(submittedAt: Date, today: string): OpsPriority {
  const daysWaiting = diffDays(formatDate(submittedAt), today);
  if (daysWaiting >= 3) return 'red';
  if (daysWaiting >= 1) return 'orange';
  return 'green';
}

export function depositRefundPriority(daysWaiting: number): OpsPriority {
  if (daysWaiting > 7) return 'red';
  if (daysWaiting >= 3) return 'orange';
  return 'green';
}

export function electricityPriority(
  effectiveStatus: 'pending' | 'overdue',
  dueDate: string,
  today: string,
): OpsPriority {
  if (effectiveStatus === 'overdue') return 'red';
  const daysUntilDue = diffDays(today, dueDate);
  if (daysUntilDue <= 7) return 'orange';
  return 'green';
}

export function ps4RenewalPriority(expiresAt: Date, today: string): OpsPriority {
  const daysLeft = diffDays(today, formatDate(expiresAt));
  if (daysLeft <= 1) return 'red';
  if (daysLeft <= 7) return 'orange';
  return 'green';
}

export function reservationPriority(checkInDate: string, today: string): OpsPriority {
  const daysUntil = diffDays(today, checkInDate);
  if (daysUntil < 0) return 'red';
  if (daysUntil <= 3) return 'orange';
  return 'green';
}

/** Pending payment proofs always need admin action. */
export function paymentApprovalPriority(): OpsPriority {
  return 'red';
}

export function comparePriority(a: OpsPriority, b: OpsPriority): number {
  const rank: Record<OpsPriority, number> = { red: 0, orange: 1, green: 2 };
  return rank[a] - rank[b];
}

export function daysRemainingUntil(dateStr: string, today: string): number {
  return diffDays(today, dateStr);
}

export function daysSinceDate(dateStr: string, today: string): number {
  return diffDays(dateStr, today);
}

export function isWithinDays(dateStr: string, today: string, days: number): boolean {
  const end = formatDate(addDays(parseDate(today), days));
  return dateStr <= end;
}

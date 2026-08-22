/**
 * Immutable notice-date SSOT for move-out — uses original submission timestamp when present.
 */
import { formatDate, normalizeIsoDateOnly, parseDate } from '@/src/lib/dates';

export type VacatingNoticeDateInput = {
  noticeGivenDate: string | Date;
  originalNoticeSubmittedAt?: Date | string | null;
};

/** Calendar date for notice-period math — frozen at first resident submission. */
export function resolveNoticeGivenDateForVacating(input: VacatingNoticeDateInput): string {
  if (input.originalNoticeSubmittedAt) {
    const raw = input.originalNoticeSubmittedAt;
    if (raw instanceof Date) {
      return formatDate(raw);
    }
    const asString = String(raw);
    if (/^\d{4}-\d{2}-\d{2}/.test(asString)) {
      return asString.slice(0, 10);
    }
    return formatDate(parseDate(raw));
  }
  const noticeRaw = input.noticeGivenDate;
  if (noticeRaw instanceof Date) {
    return formatDate(noticeRaw);
  }
  const normalized = normalizeIsoDateOnly(noticeRaw);
  if (normalized) return normalized;
  return formatDate(parseDate(noticeRaw));
}

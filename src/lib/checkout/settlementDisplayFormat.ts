import { diffDays } from '@/src/lib/dates';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { NoticeDeductionBreakdown } from '@/src/lib/vacating/noticeDeductionEngine';

export type SettlementDisplayRow = {
  id: string;
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
  deduct?: boolean;
};

export type SettlementDisplaySection = {
  title: string;
  rows: SettlementDisplayRow[];
};

export function isSettlementDisplayEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

export function formatSettlementDays(days: number | null | undefined): string {
  if (isSettlementDisplayEmpty(days)) return '—';
  const n = Math.max(0, Math.floor(Number(days)));
  return `${n} day${n === 1 ? '' : 's'}`;
}

export function formatSettlementPaise(paise: number | null | undefined, deduct = false): string {
  if (isSettlementDisplayEmpty(paise)) return '—';
  const n = Math.max(0, Math.round(Number(paise)));
  return deduct && n > 0 ? `−${paiseToInr(n)}` : paiseToInr(n);
}

export function formatSettlementDate(iso: string | null | undefined): string {
  if (isSettlementDisplayEmpty(iso)) return '—';
  return formatDate(String(iso).slice(0, 10));
}

export function formatDualDaysAndPaise(
  days: number | null | undefined,
  paise: number | null | undefined,
): string {
  const daysStr = formatSettlementDays(days);
  const paiseStr = formatSettlementPaise(paise);
  if (daysStr === '—' && paiseStr === '—') return '—';
  if (daysStr === '—') return paiseStr;
  if (paiseStr === '—') return daysStr;
  return `${daysStr} · ${paiseStr}`;
}

function inclusivePeriodDays(periodStart: string, periodEnd: string): number {
  return Math.max(1, diffDays(periodStart, periodEnd) + 1);
}

export function resolveDaysPaidDisplay(
  noticeBreakdownJson: Partial<NoticeDeductionBreakdown> | null | undefined,
  rentPaidPaise: number,
  dailyRentPaise: number,
): { value: string; hint?: string; days?: number } {
  const periodUsed = noticeBreakdownJson?.paidPeriodUsed ?? null;

  if (periodUsed?.periodStart && periodUsed?.periodEnd) {
    const days = inclusivePeriodDays(periodUsed.periodStart, periodUsed.periodEnd);
    return {
      days,
      value: formatSettlementDays(days),
      hint: `${periodUsed.periodStart} → ${periodUsed.periodEnd}`,
    };
  }

  if (dailyRentPaise > 0 && rentPaidPaise >= 0) {
    const implied = Math.floor(rentPaidPaise / dailyRentPaise);
    return {
      days: implied,
      value: formatSettlementDays(implied),
      hint: `Implied: floor(rent paid ÷ daily rent) = floor(${rentPaidPaise} ÷ ${dailyRentPaise})`,
    };
  }

  return { value: '—' };
}

export const ESTIMATED_REFUND_DISCLAIMER =
  'Estimated Refund — Final amount may change after electricity, damages, and manual deductions.';

export const PENDING_ELECTRICITY_LABEL = 'Pending final meter';
export const PENDING_DAMAGES_LABEL = 'Pending inspection';
export const PENDING_OTHER_LABEL = 'Pending';

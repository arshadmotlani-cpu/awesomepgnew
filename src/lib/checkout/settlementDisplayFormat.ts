import { diffDays } from '@/src/lib/dates';
import { asPlainNumber, formatDate, paiseToInr } from '@/src/lib/format';

const dailyRentInrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
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

function formatDailyRentInrAmount(dailyRentPaise: number): string {
  return dailyRentInrFormatter.format(asPlainNumber(dailyRentPaise) / 100);
}

/** User-facing daily rent — never exposes paise. */
export function formatDailyRentInr(dailyRentPaise: number | null | undefined): string {
  if (isSettlementDisplayEmpty(dailyRentPaise) || Number(dailyRentPaise) <= 0) return '—';
  return `${formatDailyRentInrAmount(Math.round(Number(dailyRentPaise)))}/day`;
}

export function formatDailyRentLabel(dailyRentPaise: number | null | undefined): string {
  const rate = formatDailyRentInr(dailyRentPaise);
  if (rate === '—') return 'Daily rent: —';
  return `Daily rent: ${rate.replace('/day', '')}/day`;
}

export function formatRentConsumedHint(stayDays: number, dailyRentPaise: number): string {
  const days = formatSettlementDays(stayDays);
  const rate = formatDailyRentInr(dailyRentPaise);
  if (days === '—' || rate === '—') return '—';
  return `${days} × ${rate}`;
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
): { value: string; hint?: string; auditHint?: string; days?: number } {
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
      hint: `Based on rent paid and ${formatDailyRentLabel(dailyRentPaise).toLowerCase()}`,
      auditHint: `Implied: floor(rent paid ÷ daily rent) = floor(${paiseToInr(rentPaidPaise)} ÷ ${formatDailyRentInrAmount(dailyRentPaise)})`,
    };
  }

  return { value: '—' };
}

export const ESTIMATED_REFUND_DISCLAIMER =
  'Estimated Refund — Final amount may change after electricity, damages, and manual deductions.';

export const PENDING_ELECTRICITY_LABEL = 'Pending final meter';
export const PENDING_DAMAGES_LABEL = 'Pending inspection';
export const PENDING_OTHER_LABEL = 'Pending';

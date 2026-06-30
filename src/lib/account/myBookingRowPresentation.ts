import type { MyBookingRow } from '@/src/db/queries/customer';
import { asPlainNumber, formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { stayTypeFromPricingMode, stayTypeLabel } from '@/src/lib/stayType';

export type MyBookingCardModel = {
  id: string;
  bookingCode: string | null;
  bookingHref: string | null;
  pgName: string;
  bedCount: number;
  bedCountLabel: string;
  checkInDate: string | null;
  checkInLabel: string | null;
  durationMode: string;
  durationLabel: string;
  totalPaise: number;
  totalLabel: string;
  status: string;
  statusLabel: string;
  warnings: string[];
  /** False when the row is too incomplete to link anywhere useful. */
  isLinkable: boolean;
};

const KNOWN_STATUSES = new Set([
  'pending_payment',
  'pending_approval',
  'confirmed',
  'cancelled',
  'refunded',
  'draft',
  'completed',
]);

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStatus(value: unknown): { status: string; warnings: string[] } {
  const raw = nonEmptyString(value);
  if (!raw) {
    return { status: 'unknown', warnings: ['missing booking status'] };
  }
  if (!KNOWN_STATUSES.has(raw)) {
    return { status: raw, warnings: [`unrecognized booking status: ${raw}`] };
  }
  return { status: raw, warnings: [] };
}

function normalizeDurationMode(value: unknown): { mode: string; warnings: string[] } {
  const raw = nonEmptyString(value);
  if (!raw) {
    return { mode: 'open_ended', warnings: ['missing duration mode'] };
  }
  return { mode: raw, warnings: [] };
}

/** Validates and normalizes a My Bookings row — never throws. */
export function normalizeMyBookingRow(raw: Partial<MyBookingRow> | null | undefined): MyBookingCardModel {
  const warnings: string[] = [];

  const id = nonEmptyString(raw?.id) ?? '';
  if (!id) warnings.push('missing booking id');

  const bookingCode = nonEmptyString(raw?.bookingCode);
  if (!bookingCode) warnings.push('missing booking code');

  const { status, warnings: statusWarnings } = normalizeStatus(raw?.status);
  warnings.push(...statusWarnings);

  const { mode: durationMode, warnings: modeWarnings } = normalizeDurationMode(raw?.durationMode);
  warnings.push(...modeWarnings);

  const pgName = nonEmptyString(raw?.pgName) ?? 'PG details unavailable';
  if (!nonEmptyString(raw?.pgName)) warnings.push('missing PG name');

  const bedCount = Math.max(0, Math.round(asPlainNumber(raw?.bedCount)));
  if (bedCount === 0) warnings.push('no primary bed assigned');

  const checkInDate = nonEmptyString(raw?.checkInDate);
  const checkInLabel = checkInDate ? formatDate(checkInDate) : null;

  const totalPaise = Math.max(0, Math.round(asPlainNumber(raw?.totalPaise)));

  let durationLabel = 'Stay';
  try {
    durationLabel = stayTypeLabel(stayTypeFromPricingMode(durationMode));
  } catch {
    warnings.push('could not derive stay type label');
  }

  const statusLabel = titleCase(status.replace(/_/g, ' '));

  return {
    id: id || `missing-${bookingCode ?? 'booking'}`,
    bookingCode,
    bookingHref: bookingCode ? `/booking/${encodeURIComponent(bookingCode)}` : null,
    pgName,
    bedCount,
    bedCountLabel: `${bedCount} bed${bedCount === 1 ? '' : 's'}`,
    checkInDate,
    checkInLabel,
    durationMode,
    durationLabel,
    totalPaise,
    totalLabel: paiseToInr(totalPaise),
    status,
    statusLabel,
    warnings,
    isLinkable: Boolean(bookingCode),
  };
}

export function buildMyBookingCardModels(rows: Partial<MyBookingRow>[] | null | undefined): MyBookingCardModel[] {
  if (!rows?.length) return [];
  return rows.map((row) => normalizeMyBookingRow(row));
}

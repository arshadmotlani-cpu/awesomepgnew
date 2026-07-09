import type { MyBookingRow } from '@/src/db/queries/customer';
import { asPlainNumber, formatDate, paiseToInr } from '@/src/lib/format';
import { stayTypeFromPricingMode, stayTypeLabel } from '@/src/lib/stayType';
import {
  isBookingStatus,
  isClosedBookingStatus,
  labelBookingStatus,
  type BookingStatus,
} from '@/src/lib/booking/bookingStatus';

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
  status: BookingStatus | 'invalid';
  statusLabel: string;
  warnings: string[];
  /** False when the row is too incomplete to link anywhere useful. */
  isLinkable: boolean;
  /** Closed bookings (superseded, cancelled, completed, refunded). */
  isClosed: boolean;
};

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStatus(value: unknown): {
  status: BookingStatus | 'invalid';
  warnings: string[];
} {
  const raw = nonEmptyString(value);
  if (!raw) {
    return { status: 'invalid', warnings: ['missing booking status'] };
  }
  if (!isBookingStatus(raw)) {
    return { status: 'invalid', warnings: [`invalid booking status: ${raw}`] };
  }
  return { status: raw, warnings: [] };
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

  const durationMode = nonEmptyString(raw?.durationMode) ?? 'open_ended';
  if (!nonEmptyString(raw?.durationMode)) warnings.push('missing duration mode');

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

  const statusLabel =
    durationMode === 'reserve' && raw?.reserveStatus === 'active'
      ? 'Reservation confirmed'
      : durationMode === 'reserve' && raw?.reserveStatus === 'under_review'
        ? 'Reservation under review'
        : durationMode === 'reserve' &&
            (raw?.reserveStatus === 'cancelled' || raw?.reserveStatus === 'expired')
          ? 'Reservation cancelled'
        : status === 'invalid'
          ? 'Invalid'
          : labelBookingStatus(status);

  const reserveHoldClosed =
    durationMode === 'reserve' &&
    (raw?.reserveStatus === 'cancelled' || raw?.reserveStatus === 'expired');
  const isClosed =
    status !== 'invalid' && (isClosedBookingStatus(status) || reserveHoldClosed);

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
    isClosed,
  };
}

export function buildMyBookingCardModels(rows: Partial<MyBookingRow>[] | null | undefined): MyBookingCardModel[] {
  if (!rows?.length) return [];
  return rows.map((row) => normalizeMyBookingRow(row));
}

export function partitionMyBookingCardModels(models: MyBookingCardModel[]): {
  open: MyBookingCardModel[];
  closed: MyBookingCardModel[];
} {
  const open: MyBookingCardModel[] = [];
  const closed: MyBookingCardModel[] = [];
  for (const model of models) {
    if (model.isClosed) closed.push(model);
    else open.push(model);
  }
  return { open, closed };
}

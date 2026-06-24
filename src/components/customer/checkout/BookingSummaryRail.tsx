'use client';

import Link from 'next/link';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { isMonthlyStayType, stayTypeLabel, type StayType } from '@/src/lib/stayType';
import { bookingNewSearchParams } from '@/src/lib/booking/bookingFunnelDates';

export type BookingSummaryData = {
  pgSlug?: string;
  pgName?: string;
  roomId?: string;
  roomNumber?: string;
  bedId?: string;
  bedCode?: string;
  stayType?: string;
  moveInDate?: string;
  moveOutDate?: string;
  stayNights?: number;
  rentPaise?: number;
  depositPaise?: number;
  totalDuePaise?: number;
};

function editHref(
  field: 'pg' | 'room' | 'bed' | 'dates',
  data: BookingSummaryData,
): string | null {
  if (field === 'pg' && data.pgSlug) return `/pgs/${data.pgSlug}`;
  if (field === 'room' && data.pgSlug && data.roomId) {
    return `/pgs/${data.pgSlug}/rooms/${data.roomId}#bed-selector`;
  }
  if (field === 'bed' && data.pgSlug && data.roomId) {
    return `/pgs/${data.pgSlug}/rooms/${data.roomId}#bed-selector`;
  }
  if (field === 'dates' && data.bedId && data.moveInDate) {
    const params = bookingNewSearchParams({
      bedIds: [data.bedId],
      start: data.moveInDate,
      end: data.moveOutDate ?? null,
      stayType: isMonthlyStayType(data.stayType) ? 'monthly_stay' : 'fixed_date_stay',
    });
    return `/booking/new?${params.toString()}`;
  }
  return null;
}

function hasRoomSelection(data: BookingSummaryData): boolean {
  return Boolean(data.roomId);
}

function Row({
  label,
  value,
  editLink,
  emphasize,
}: {
  label: string;
  value: React.ReactNode;
  editLink?: string | null;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <dt className="text-sm text-apg-silver">{label}</dt>
      <dd
        className={`text-right text-sm font-medium ${emphasize ? 'text-base font-semibold text-apg-orange' : 'text-white'}`}
      >
        {value}
        {editLink ? (
          <>
            {' '}
            <Link href={editLink} className="text-xs font-semibold text-apg-cyan hover:underline">
              Edit
            </Link>
          </>
        ) : null}
      </dd>
    </div>
  );
}

export function BookingSummaryRail({ data }: { data: BookingSummaryData }) {
  const roomSelected = hasRoomSelection(data);
  const fixedDates = data.stayType && !isMonthlyStayType(data.stayType);
  const stayLabel = data.stayType ? stayTypeLabel(data.stayType as StayType) : null;
  const showRent = data.rentPaise != null && data.rentPaise > 0;
  const showDeposit = data.depositPaise != null && data.depositPaise > 0;
  const showTotal = data.totalDuePaise != null && data.totalDuePaise > 0;

  return (
    <aside
      className="overflow-hidden rounded-2xl border border-white/10 bg-[#121a26]/90 shadow-[0_16px_48px_rgba(0,0,0,0.35)] backdrop-blur-md"
      aria-label="Booking summary"
    >
      <div className="border-b border-white/8 px-5 py-4">
        <h2 className="text-base font-semibold text-white">Your booking</h2>
        {!roomSelected ? (
          <p className="mt-1.5 text-sm leading-relaxed text-apg-silver">
            Select a room to begin.
          </p>
        ) : (
          <p className="mt-1 text-xs text-apg-muted">Review your choices as you go.</p>
        )}
      </div>

      {!roomSelected ? (
        <div className="px-5 py-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-white/10">
            <span className="text-lg text-apg-muted" aria-hidden>
              ○
            </span>
          </div>
          <p className="mt-4 text-sm text-apg-silver">
            Pick a room and bed to see rent, deposit, and your total.
          </p>
        </div>
      ) : (
        <dl className="divide-y divide-white/8 px-5">
          {data.pgName ? (
            <Row label="PG" value={data.pgName} editLink={editHref('pg', data)} />
          ) : null}
          {data.roomNumber ? (
            <Row
              label="Room"
              value={`Room ${data.roomNumber}`}
              editLink={editHref('room', data)}
            />
          ) : null}
          {data.bedCode ? (
            <Row label="Bed" value={`Bed ${data.bedCode}`} editLink={editHref('bed', data)} />
          ) : null}
          {stayLabel ? (
            <Row label="Stay type" value={stayLabel} editLink={editHref('dates', data)} />
          ) : null}
          {data.moveInDate ? (
            <Row
              label="Check-in"
              value={formatDate(data.moveInDate)}
              editLink={editHref('dates', data)}
            />
          ) : null}
          {fixedDates && data.moveOutDate ? (
            <Row
              label="Check-out"
              value={formatDate(data.moveOutDate)}
              editLink={editHref('dates', data)}
            />
          ) : null}
          {fixedDates && data.stayNights != null && data.stayNights > 0 ? (
            <Row
              label="Duration"
              value={`${data.stayNights} night${data.stayNights === 1 ? '' : 's'}`}
            />
          ) : null}
          {showRent ? <Row label="Rent" value={paiseToInr(data.rentPaise!)} /> : null}
          {showDeposit ? <Row label="Deposit" value={paiseToInr(data.depositPaise!)} /> : null}
          {showTotal ? (
            <Row
              label="Total due today"
              value={paiseToInr(data.totalDuePaise!)}
              emphasize
            />
          ) : null}
        </dl>
      )}
    </aside>
  );
}

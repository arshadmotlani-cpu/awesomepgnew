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

function Row({
  label,
  value,
  editLink,
}: {
  label: string;
  value: React.ReactNode;
  editLink?: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs">
      <dt className="text-apg-silver">{label}</dt>
      <dd className="text-right font-medium text-white">
        {value}
        {editLink ? (
          <>
            {' '}
            <Link href={editLink} className="text-apg-cyan hover:underline">
              Edit
            </Link>
          </>
        ) : null}
      </dd>
    </div>
  );
}

export function BookingSummaryRail({ data }: { data: BookingSummaryData }) {
  const fixedDates = data.stayType && !isMonthlyStayType(data.stayType);
  const stayLabel = data.stayType
    ? stayTypeLabel(data.stayType as StayType)
    : '—';

  return (
    <aside
      className="rounded-xl border border-white/10 apg-glass-light p-4"
      aria-label="Booking summary"
    >
      <h2 className="text-xs font-semibold uppercase tracking-wider text-apg-orange">
        Your booking
      </h2>
      <dl className="mt-3 space-y-2">
        <Row
          label="PG"
          value={data.pgName ?? '—'}
          editLink={editHref('pg', data)}
        />
        <Row
          label="Room"
          value={data.roomNumber ? `Room ${data.roomNumber}` : '—'}
          editLink={editHref('room', data)}
        />
        <Row
          label="Bed"
          value={data.bedCode ? `Bed ${data.bedCode}` : '—'}
          editLink={editHref('bed', data)}
        />
        <Row
          label="Stay type"
          value={stayLabel}
          editLink={editHref('dates', data)}
        />
        <Row
          label="Check-in"
          value={data.moveInDate ? formatDate(data.moveInDate) : '—'}
          editLink={editHref('dates', data)}
        />
        {fixedDates ? (
          <>
            <Row
              label="Check-out"
              value={data.moveOutDate ? formatDate(data.moveOutDate) : '—'}
              editLink={editHref('dates', data)}
            />
            <Row
              label="Duration"
              value={
                data.stayNights != null && data.stayNights > 0
                  ? `${data.stayNights} night${data.stayNights === 1 ? '' : 's'}`
                  : '—'
              }
            />
          </>
        ) : null}
        <Row
          label="Rent"
          value={data.rentPaise != null && data.rentPaise > 0 ? paiseToInr(data.rentPaise) : '—'}
        />
        <Row
          label="Deposit"
          value={
            data.depositPaise != null && data.depositPaise > 0
              ? paiseToInr(data.depositPaise)
              : '—'
          }
        />
        <div className="border-t border-white/10 pt-2">
          <Row
            label="Total due today"
            value={
              data.totalDuePaise != null && data.totalDuePaise > 0 ? (
                <span className="text-apg-orange">{paiseToInr(data.totalDuePaise)}</span>
              ) : (
                '—'
              )
            }
          />
        </div>
      </dl>
    </aside>
  );
}

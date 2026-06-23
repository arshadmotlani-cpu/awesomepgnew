'use client';

import Link from 'next/link';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { stayTypeLabel, type StayType } from '@/src/lib/stayType';

export type BookingSummaryData = {
  pgSlug?: string;
  pgName?: string;
  roomId?: string;
  roomNumber?: string;
  bedId?: string;
  bedCode?: string;
  stayType?: string;
  moveInDate?: string;
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
  if (field === 'dates' && data.pgSlug && data.bedId) {
    const params = new URLSearchParams();
    params.append('bed', data.bedId);
    if (data.moveInDate) params.set('start', data.moveInDate);
    if (data.stayType) params.set('stayType', data.stayType);
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
          label="Move-in"
          value={data.moveInDate ? formatDate(data.moveInDate) : '—'}
          editLink={editHref('dates', data)}
        />
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

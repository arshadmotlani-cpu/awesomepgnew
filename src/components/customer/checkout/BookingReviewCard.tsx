import type { ReactNode } from 'react';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/lib/dateDefaults';

export type BookingReviewData = {
  pgName: string;
  roomNumber: string;
  bedCode: string;
  stayTypeLabel: string;
  isMonthly: boolean;
  checkIn: string;
  checkOut?: string | null;
  stayNights?: number | null;
  rentPaise: number;
  depositPaise: number;
  totalDuePaise: number;
};

function Row({ label, value, emphasize }: { label: string; value: ReactNode; emphasize?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/8 py-3.5 last:border-0">
      <dt className="text-sm text-apg-silver">{label}</dt>
      <dd
        className={`text-right text-sm font-medium ${emphasize ? 'text-lg font-bold text-apg-orange' : 'text-white'}`}
      >
        {value}
      </dd>
    </div>
  );
}

export function BookingReviewCard({ data }: { data: BookingReviewData }) {
  return (
    <article className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#1a2332] to-[#121820] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
      <header className="border-b border-white/8 px-6 py-5 sm:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-apg-cyan">
          Booking review
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {data.pgName}
        </h1>
        <p className="mt-1 text-sm text-apg-silver">
          Room {data.roomNumber} · Bed {data.bedCode}
        </p>
      </header>

      <dl className="px-6 py-2 sm:px-8">
        <Row label="Stay type" value={data.stayTypeLabel} />
        <Row label="Check-in" value={formatDate(data.checkIn)} />
        {!data.isMonthly && data.checkOut ? (
          <Row label="Check-out" value={formatDate(data.checkOut)} />
        ) : null}
        {!data.isMonthly && data.stayNights != null && data.stayNights > 0 ? (
          <Row
            label="Duration"
            value={`${data.stayNights} night${data.stayNights === 1 ? '' : 's'}`}
          />
        ) : null}
        <Row label="Rent" value={paiseToInr(data.rentPaise)} />
        <Row label="Deposit" value={paiseToInr(data.depositPaise)} />
        <Row label="Total payable today" value={paiseToInr(data.totalDuePaise)} emphasize />
      </dl>

      <footer className="space-y-3 border-t border-white/8 bg-black/20 px-6 py-5 text-xs leading-relaxed text-apg-silver sm:px-8">
        <p>
          <span className="font-semibold text-white">Notice policy:</span>{' '}
          {VACATING_NOTICE_MIN_DAYS}-day notice before move-out. Submit a move-out request when you
          decide to leave.
        </p>
        <p>
          <span className="font-semibold text-white">Cancellation:</span> Free cancellation before
          check-in. After check-in, standard PG cancellation terms apply.
        </p>
        {data.isMonthly ? (
          <p>
            <span className="font-semibold text-white">Expected monthly rent:</span>{' '}
            {paiseToInr(data.rentPaise)} / month (billed monthly while you stay).
          </p>
        ) : null}
      </footer>
    </article>
  );
}

import type { ReactNode } from 'react';
import Link from 'next/link';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { isMonthlyStayType, type StayType } from '@/src/lib/stayType';

export type BookingReviewLineItem = {
  label: string;
  amountPaise: number;
  detail?: string;
  tone?: 'credit' | 'charge';
};

export type BookingReviewData = {
  pgName: string;
  roomNumber: string;
  bedCode: string;
  stayType: StayType;
  stayTypeLabel: string;
  checkIn: string;
  checkOut?: string | null;
  stayNights?: number | null;
  rentPaise: number;
  depositPaise: number;
  totalDuePaise: number;
  lineItems?: BookingReviewLineItem[];
};

function Row({
  label,
  value,
  emphasize,
  detail,
}: {
  label: string;
  value: ReactNode;
  emphasize?: boolean;
  detail?: string;
}) {
  return (
    <div className="border-b border-white/8 py-3.5 last:border-0">
      <div className="flex items-start justify-between gap-4">
        <dt className="text-sm text-apg-silver">{label}</dt>
        <dd
          className={`text-right text-sm font-medium ${emphasize ? 'text-lg font-bold text-apg-orange' : 'text-white'}`}
        >
          {value}
        </dd>
      </div>
      {detail ? <p className="mt-1 text-xs text-apg-silver/80">{detail}</p> : null}
    </div>
  );
}

export function BookingReviewCard({ data }: { data: BookingReviewData }) {
  const isMonthly = isMonthlyStayType(data.stayType);

  const lineItems =
    data.lineItems ??
    [
      {
        label: `Rent (${data.roomNumber} · Bed ${data.bedCode})`,
        amountPaise: data.rentPaise,
        detail: 'Quoted from current bed pricing',
      },
      {
        label: 'Security deposit',
        amountPaise: data.depositPaise,
        detail: 'Required deposit for this stay',
      },
    ];

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
        {!isMonthly && data.checkOut ? (
          <Row label="Check-out" value={formatDate(data.checkOut)} />
        ) : null}
        {!isMonthly && data.stayNights != null && data.stayNights > 0 ? (
          <Row
            label="Duration"
            value={`${data.stayNights} night${data.stayNights === 1 ? '' : 's'}`}
          />
        ) : null}
        {lineItems.map((item) => (
          <Row
            key={item.label}
            label={item.label}
            value={
              item.tone === 'credit'
                ? `−${paiseToInr(item.amountPaise)}`
                : paiseToInr(item.amountPaise)
            }
            detail={item.detail}
          />
        ))}
        <Row label="Total payable today" value={paiseToInr(data.totalDuePaise)} emphasize />
      </dl>

      <footer className="space-y-2 border-t border-white/8 bg-black/20 px-6 py-5 text-xs leading-relaxed text-apg-silver sm:px-8">
        <p className="font-semibold text-white">Awesome PG policies</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>14-day notice required before moving out (monthly stays).</li>
          <li>Security deposit refunded after checkout inspection and meter reading.</li>
          <li>Electricity billed monthly — your share is split among room occupants.</li>
          <li>Rent and deposit amounts above come directly from our pricing system.</li>
        </ul>
        <p>
          <Link href="/about" className="text-apg-cyan hover:text-apg-orange">
            Full policies →
          </Link>
        </p>
        {isMonthly ? (
          <p className="pt-1">
            <span className="font-semibold text-white">Expected monthly rent:</span>{' '}
            {paiseToInr(data.rentPaise)} / month while you stay.
          </p>
        ) : null}
      </footer>
    </article>
  );
}

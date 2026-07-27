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
  /** Gross rent subtotal (before coupon). */
  rentPaise: number;
  /** Deposit due now (after credit). */
  depositPaise: number;
  /** Deposit required before credit (for live recalculation). */
  depositRequiredPaise?: number;
  depositCreditAppliedPaise?: number;
  priorOutstandingPaise?: number;
  totalDuePaise: number;
  lineItems?: BookingReviewLineItem[];
};

function Row({
  label,
  value,
  emphasize,
  detail,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  emphasize?: boolean;
  detail?: string;
  valueClassName?: string;
}) {
  return (
    <div className="border-b border-white/8 py-3.5 last:border-0">
      <div className="flex items-start justify-between gap-4">
        <dt className="text-sm text-apg-silver">{label}</dt>
        <dd
          className={`text-right text-sm font-medium ${
            valueClassName ??
            (emphasize ? 'text-lg font-bold text-apg-orange' : 'text-white')
          }`}
        >
          {value}
        </dd>
      </div>
      {detail ? <p className="mt-1 text-xs text-apg-silver/80">{detail}</p> : null}
    </div>
  );
}

export function BookingReviewCard({
  data,
  discountPaise = 0,
  couponCode = null,
  couponLabel = null,
  totalDuePaise,
  couponSection,
}: {
  data: BookingReviewData;
  discountPaise?: number;
  couponCode?: string | null;
  couponLabel?: string | null;
  /** Live total when coupon state changes; defaults to data.totalDuePaise. */
  totalDuePaise?: number;
  couponSection?: ReactNode;
}) {
  const isMonthly = isMonthlyStayType(data.stayType);
  const liveTotal = totalDuePaise ?? data.totalDuePaise;
  const rentGross = data.rentPaise;
  const depositLine = data.depositPaise;
  const hasDiscount = discountPaise > 0;
  const pctOff =
    hasDiscount && rentGross > 0
      ? Math.round((discountPaise / rentGross) * 100)
      : null;

  const staticLineItems =
    data.lineItems?.filter(
      (item) =>
        !item.label.toLowerCase().startsWith('rent') &&
        !item.label.toLowerCase().includes('security deposit') &&
        item.label !== 'Security deposit',
    ) ?? [];

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
        <Row
          label={`Rent (${data.roomNumber} · Bed ${data.bedCode})`}
          value={paiseToInr(rentGross)}
          detail="Quoted from current bed pricing"
        />
        {hasDiscount ? (
          <Row
            label="Coupon discount"
            value={`−${paiseToInr(discountPaise)}`}
            valueClassName="text-emerald-300"
            detail="Applies to rent only — not deposit"
          />
        ) : null}
        <Row
          label="Security deposit"
          value={paiseToInr(depositLine)}
          detail="Required deposit for this stay"
        />
        {staticLineItems.map((item) => (
          <Row
            key={item.label}
            label={item.label}
            value={
              item.tone === 'credit'
                ? `−${paiseToInr(item.amountPaise)}`
                : paiseToInr(item.amountPaise)
            }
            detail={item.detail}
            valueClassName={item.tone === 'credit' ? 'text-emerald-300' : undefined}
          />
        ))}
        <Row label="Total payable today" value={paiseToInr(liveTotal)} emphasize />
      </dl>

      {couponSection ? (
        <div className="border-t border-white/8 px-6 py-5 sm:px-8">{couponSection}</div>
      ) : null}

      {hasDiscount && couponCode ? (
        <div className="border-t border-white/8 px-6 pb-4 sm:px-8">
          <div className="inline-flex flex-wrap items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/30">
            <span>Coupon Applied</span>
            <span className="font-mono tracking-wide">{couponCode}</span>
            {pctOff != null ? <span>{pctOff}% OFF</span> : null}
            {couponLabel ? <span className="font-normal opacity-80">· {couponLabel}</span> : null}
          </div>
        </div>
      ) : null}

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

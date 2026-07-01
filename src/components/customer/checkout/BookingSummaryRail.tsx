'use client';

import { formatDate, paiseToInr } from '@/src/lib/format';
import { hasBookingDraftSelection } from '@/src/lib/booking/bookingDraft';
import { isMonthlyStayType, stayTypeLabel, type StayType } from '@/src/lib/stayType';

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
  discountPaise?: number;
  couponDiscountPaise?: number;
  taxPaise?: number;
  totalDuePaise?: number;
};

function Row({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: React.ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <dt className="text-sm text-apg-silver">{label}</dt>
      <dd
        className={`text-right text-sm font-medium ${emphasize ? 'text-base font-semibold text-apg-orange' : 'text-white'}`}
      >
        {value}
      </dd>
    </div>
  );
}

export function BookingSummaryRail({ data }: { data: BookingSummaryData }) {
  const hasSelection = hasBookingDraftSelection(data);
  const fixedDates = data.stayType && !isMonthlyStayType(data.stayType);
  const stayLabel = data.stayType ? stayTypeLabel(data.stayType as StayType) : null;
  const showRent = data.rentPaise != null && data.rentPaise >= 0;
  const showDeposit = data.depositPaise != null && data.depositPaise >= 0;
  const showDiscount = (data.discountPaise ?? 0) > 0 || (data.couponDiscountPaise ?? 0) > 0;
  const showTax = (data.taxPaise ?? 0) > 0;
  const showTotal = data.totalDuePaise != null && data.totalDuePaise >= 0;

  return (
    <aside
      className="overflow-hidden rounded-2xl border border-white/10 bg-[#121a26]/90 shadow-[0_16px_48px_rgba(0,0,0,0.35)] backdrop-blur-md"
      aria-label="Booking summary"
    >
      <div className="border-b border-white/8 px-5 py-4">
        <h2 className="text-base font-semibold text-white">Your booking</h2>
        {!hasSelection ? (
          <p className="mt-1.5 text-sm leading-relaxed text-apg-silver">
            Choose a bed to get started.
          </p>
        ) : !data.moveInDate ? (
          <p className="mt-1 text-xs text-apg-muted">Pick your stay type and dates next.</p>
        ) : (
          <p className="mt-1 text-xs text-apg-muted">All prices from our pricing engine.</p>
        )}
      </div>

      {!hasSelection ? (
        <div className="px-5 py-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-white/10">
            <span className="text-lg text-apg-muted" aria-hidden>
              ○
            </span>
          </div>
          <p className="mt-4 text-sm text-apg-silver">
            Select a bed, then choose how long you want to stay.
          </p>
        </div>
      ) : (
        <dl className="divide-y divide-white/8 px-5">
          {data.pgName ? <Row label="PG" value={data.pgName} /> : null}
          {data.roomNumber ? <Row label="Room" value={`Room ${data.roomNumber}`} /> : null}
          {data.bedCode ? <Row label="Bed" value={`Bed ${data.bedCode}`} /> : null}
          {stayLabel ? <Row label="Stay type" value={stayLabel} /> : null}
          {data.moveInDate ? <Row label="Check-in" value={formatDate(data.moveInDate)} /> : null}
          {fixedDates && data.moveOutDate ? (
            <Row label="Check-out" value={formatDate(data.moveOutDate)} />
          ) : null}
          {fixedDates && data.stayNights != null && data.stayNights > 0 ? (
            <Row
              label="Duration"
              value={`${data.stayNights} night${data.stayNights === 1 ? '' : 's'}`}
            />
          ) : null}
          {showRent ? <Row label="Rent" value={paiseToInr(data.rentPaise!)} /> : null}
          {showDeposit ? <Row label="Deposit" value={paiseToInr(data.depositPaise!)} /> : null}
          {showDiscount ? (
            <Row
              label="Discount"
              value={`−${paiseToInr((data.discountPaise ?? 0) + (data.couponDiscountPaise ?? 0))}`}
            />
          ) : null}
          {showTax ? <Row label="Taxes" value={paiseToInr(data.taxPaise!)} /> : null}
          {showTotal ? (
            <Row
              label="Grand total"
              value={paiseToInr(data.totalDuePaise!)}
              emphasize
            />
          ) : data.moveInDate && !showTotal ? (
            <Row label="Grand total" value="Calculating…" />
          ) : null}
        </dl>
      )}
    </aside>
  );
}

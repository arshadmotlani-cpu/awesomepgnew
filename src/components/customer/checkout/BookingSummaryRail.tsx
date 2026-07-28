'use client';

import { formatDate, paiseToInr } from '@/src/lib/format';
import { hasBookingDraftSelection } from '@/src/lib/booking/bookingDraft';
import { isMonthlyStayType, stayTypeLabel, type StayType } from '@/src/lib/stayType';
import { buildBookingCheckoutSummaryLines } from '@/src/lib/billing/bookingCheckoutTotals';

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
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  emphasize?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <dt className="text-sm text-apg-silver">{label}</dt>
      <dd
        className={`text-right text-sm font-medium ${
          valueClassName ??
          (emphasize ? 'text-base font-semibold text-apg-orange' : 'text-white')
        }`}
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
  const discountPaise = (data.discountPaise ?? 0) + (data.couponDiscountPaise ?? 0);
  const hasPricing =
    data.rentPaise != null && data.depositPaise != null && data.totalDuePaise != null;

  const pricingLines = hasPricing
    ? buildBookingCheckoutSummaryLines({
        rentSubtotalPaise: data.rentPaise!,
        discountPaise,
        depositRequiredPaise: data.depositPaise!,
        otherCharges:
          (data.taxPaise ?? 0) > 0
            ? [{ label: 'Taxes', amountPaise: data.taxPaise! }]
            : undefined,
        totalToCollectTodayPaise: data.totalDuePaise!,
        rentLabel: 'Rent',
        depositLabel: 'Deposit',
        totalLabel: 'Grand total',
      })
    : [];

  // Prefer shared helper labels (Rent → Promo discount → Deposit → Total)

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
          {pricingLines.map((line) => (
            <Row
              key={`${line.kind}-${line.label}`}
              label={line.label}
              value={
                line.isCredit
                  ? `−${paiseToInr(line.amountPaise)}`
                  : paiseToInr(line.amountPaise)
              }
              emphasize={line.emphasize}
              valueClassName={line.isCredit ? 'text-emerald-300' : undefined}
            />
          ))}
          {!hasPricing && data.moveInDate ? (
            <Row label="Grand total" value="Calculating…" />
          ) : null}
        </dl>
      )}
    </aside>
  );
}

'use client';

import { formatDate, paiseToInr } from '@/src/lib/format';
import type { PaymentBookingContextView } from '@/src/lib/operations/paymentBookingContextView';

function ContextRow({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string | null | undefined;
  emphasize?: boolean;
}) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd
        className={`mt-0.5 text-sm ${emphasize ? 'font-semibold text-white' : 'font-medium text-white'}`}
      >
        {value}
      </dd>
    </div>
  );
}

export function PaymentBookingContextBlock({
  context,
}: {
  context: PaymentBookingContextView;
}) {
  const stayRange =
    context.moveInDate && context.moveOutDate
      ? `${formatDate(context.moveInDate)} → ${formatDate(context.moveOutDate)}`
      : context.moveInDate
        ? `From ${formatDate(context.moveInDate)}`
        : null;

  return (
    <div className="mt-4 rounded-xl border border-indigo-400/20 bg-indigo-500/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200/90">
        Booking context
      </p>

      {context.bookingCode ? (
        <p className="mt-2 text-base font-semibold text-white">{context.bookingCode}</p>
      ) : (
        <p className="mt-2 text-base font-semibold text-white">{context.bookingType}</p>
      )}

      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ContextRow label="Type" value={context.bookingType} />
        <ContextRow label="PG" value={context.pgName} />
        <ContextRow label="Room" value={context.roomNumber} />
        <ContextRow label="Bed" value={context.bedCode} />
        <ContextRow label="Pricing rule" value={context.pricingRule} />
        <ContextRow label="Duration" value={context.duration} />
      </dl>

      {stayRange ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-[#121820]/60 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-apg-silver">Stay</p>
          <p className="mt-0.5 text-sm font-medium text-white">{stayRange}</p>
        </div>
      ) : null}

      <dl className="mt-3 grid gap-3 border-t border-white/10 pt-3 sm:grid-cols-2">
        {context.rentAmountPaise != null ? (
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-apg-silver">Rent</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-300">
              {paiseToInr(context.rentAmountPaise)}
            </dd>
            {context.rentCalculation ? (
              <p className="mt-1 text-xs text-apg-silver">{context.rentCalculation}</p>
            ) : null}
          </div>
        ) : null}

        {context.depositPolicy ? (
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-apg-silver">Deposit policy</dt>
            <dd className="mt-0.5 text-sm font-medium text-white">{context.depositPolicy}</dd>
            {context.requiredDepositPaise != null ? (
              <p className="mt-1 text-lg font-semibold tabular-nums text-amber-200">
                {paiseToInr(context.requiredDepositPaise)}
              </p>
            ) : null}
          </div>
        ) : null}
      </dl>
    </div>
  );
}

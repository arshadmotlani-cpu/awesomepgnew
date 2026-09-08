'use client';

import type { PaymentReviewBookingPricingDisplay } from '@/src/lib/operations/paymentReviewBookingPricingDisplay';

function Row({
  label,
  value,
  detail,
  emphasize = false,
}: {
  label: string;
  value: string;
  detail?: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <dt className="text-apg-silver">{label}</dt>
      <dd className="shrink-0 text-right">
        <span
          className={`tabular-nums font-medium ${
            emphasize ? 'text-base font-semibold text-white' : 'text-white'
          }`}
        >
          {value}
        </span>
        {detail ? <p className="mt-0.5 text-xs text-apg-silver">{detail}</p> : null}
      </dd>
    </div>
  );
}

export function PaymentReviewBookingPricingRows({
  display,
}: {
  display: PaymentReviewBookingPricingDisplay;
}) {
  return (
    <>
      {display.rows.map((row) => (
        <Row key={row.label} label={row.label} value={row.value} detail={row.detail} />
      ))}
    </>
  );
}

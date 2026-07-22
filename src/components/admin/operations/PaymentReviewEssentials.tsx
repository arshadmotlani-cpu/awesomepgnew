'use client';

import { paiseToInr } from '@/src/lib/format';
import { buildPaymentReviewVerification } from '@/src/lib/operations/paymentReviewVerification';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

function Row({
  label,
  value,
  emphasize = false,
  tone,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  tone?: 'success' | 'warning' | 'danger';
}) {
  const valueClass =
    tone === 'success'
      ? 'text-emerald-300'
      : tone === 'warning'
        ? 'text-amber-200'
        : tone === 'danger'
          ? 'text-rose-300'
          : emphasize
            ? 'text-white'
            : 'text-white';

  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <dt className="text-apg-silver">{label}</dt>
      <dd
        className={`shrink-0 text-right tabular-nums ${
          emphasize ? 'text-base font-semibold' : 'font-medium'
        } ${valueClass}`}
      >
        {value}
      </dd>
    </div>
  );
}

/** Verification-only payment review — Expected / Screenshot / Difference. */
export function PaymentReviewEssentials({ item }: { item: PendingPaymentReviewItem }) {
  const verification = buildPaymentReviewVerification(item);
  const contextLine = [item.pgName, item.roomNumber, item.bedCode ? `Bed ${item.bedCode}` : null]
    .filter(Boolean)
    .join(' · ');

  const diffLabel =
    verification.differenceTone === 'exact'
      ? paiseToInr(0)
      : verification.differenceTone === 'short'
        ? paiseToInr(verification.differencePaise)
        : `${paiseToInr(Math.abs(verification.differencePaise))} extra`;

  const diffTone =
    verification.differenceTone === 'exact'
      ? undefined
      : verification.differenceTone === 'short'
        ? 'warning'
        : 'danger';

  const showBooking =
    item.bookingId &&
    (verification.monthlyRentPaise > 0 || verification.depositRequiredPaise > 0);

  return (
    <div className="rounded-xl border border-white/10 bg-[#121820] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">
            {item.bookingContext?.bookingType ?? item.paymentTypeLabel}
          </p>
          {contextLine ? (
            <p className="mt-0.5 text-xs text-apg-silver">{contextLine}</p>
          ) : null}
        </div>
        <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-100">
          Awaiting review
        </span>
      </div>

      <div className="my-4 border-t border-white/10" />

      <dl className="space-y-2.5">
        {showBooking ? (
          <>
            <Row label="Monthly rent" value={paiseToInr(verification.monthlyRentPaise)} />
            <Row label="Required deposit" value={paiseToInr(verification.depositRequiredPaise)} />
            <Row
              label="Expected payment"
              value={paiseToInr(verification.expectedPaymentPaise)}
              emphasize
            />
          </>
        ) : (
          <Row
            label="Expected"
            value={paiseToInr(verification.expectedPaymentPaise)}
            emphasize
          />
        )}
        <Row
          label="Screenshot amount"
          value={paiseToInr(verification.screenshotAmountPaise)}
          emphasize
          tone="success"
        />
        <Row label="Difference" value={diffLabel} emphasize tone={diffTone} />
      </dl>

      <p className="mt-4 text-xs text-apg-silver">
        Approve confirms the booking using contract rent and deposit values. The screenshot is
        verification only.
      </p>
    </div>
  );
}

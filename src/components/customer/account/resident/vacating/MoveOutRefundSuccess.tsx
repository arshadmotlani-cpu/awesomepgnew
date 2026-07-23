'use client';

import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { primaryBtn } from '@/src/lib/design-system/tokens';

export function MoveOutRefundSuccess({
  refundPaise,
  refundPaidAt,
  payoutUpiId,
  bookingId,
}: {
  refundPaise: number;
  refundPaidAt: Date | string | null;
  payoutUpiId: string | null;
  bookingId: string;
}) {
  const paidLabel = refundPaidAt
    ? formatDate(
        refundPaidAt instanceof Date
          ? refundPaidAt.toISOString().slice(0, 10)
          : String(refundPaidAt).slice(0, 10),
      )
    : '—';

  return (
    <ApgCard tier="account" className="overflow-hidden border-emerald-200 bg-emerald-50/50 p-0">
      <div className="px-5 py-6">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-lg font-bold text-white"
            aria-hidden
          >
            ✓
          </span>
          <div>
            <h2 className="text-lg font-bold text-zinc-900">Your move-out has been completed.</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Your deposit settlement is closed. Keep your receipt for your records.
            </p>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 rounded-xl border border-emerald-200/80 bg-white/80 p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-600">Refund sent</dt>
            <dd className="mt-0.5 text-lg font-bold tabular-nums text-emerald-700">
              {paiseToInr(refundPaise)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-600">Payment date</dt>
            <dd className="mt-0.5 font-medium text-zinc-900">{paidLabel}</dd>
          </div>
          {payoutUpiId?.trim() ? (
            <div className="sm:col-span-2">
              <dt className="text-zinc-600">UPI ID used</dt>
              <dd className="mt-0.5 font-mono font-medium text-zinc-900">{payoutUpiId.trim()}</dd>
            </div>
          ) : null}
        </dl>

        <Link
          href={`/account/resident/history/${bookingId}`}
          className={`${primaryBtn} mt-5 inline-flex w-full justify-center sm:w-auto`}
        >
          View settlement receipt
        </Link>
      </div>
    </ApgCard>
  );
}

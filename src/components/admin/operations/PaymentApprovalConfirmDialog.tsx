'use client';

import { useEffect, useRef } from 'react';
import { OPS_ORANGE } from '@/src/components/admin/residentOps/residentOpsUi';
import { paiseToInr } from '@/src/lib/format';
import type { PaymentReviewBreakdown } from '@/src/lib/operations/paymentReviewBreakdown';

type Props = {
  open: boolean;
  residentName: string;
  breakdown: PaymentReviewBreakdown;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function PaymentApprovalConfirmDialog({
  open,
  residentName,
  breakdown,
  pending = false,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onCancel();
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => confirmRef.current?.focus(), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [open, onCancel, pending]);

  if (!open) return null;

  const effects: string[] = [
    'Mark payment approved',
    breakdown.roomChargesPaidPaise > 0
      ? `Credit ${paiseToInr(breakdown.roomChargesPaidPaise)} as booking / room charges`
      : null,
    breakdown.depositPaidPaise > 0
      ? `Credit ${paiseToInr(breakdown.depositPaidPaise)} to the resident's refundable security deposit ledger`
      : null,
    breakdown.priorPaidPaise > 0
      ? `Apply ${paiseToInr(breakdown.priorPaidPaise)} to prior outstanding`
      : null,
    'Update resident financial records',
    'Notify the resident',
  ].filter((x): x is string => Boolean(x));

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal
        aria-labelledby="payment-approve-title"
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1A1F27] p-5 shadow-2xl"
      >
        <h2 id="payment-approve-title" className="text-lg font-semibold text-white">
          You are approving
        </h2>

        <dl className="mt-4 space-y-2.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-apg-silver">Resident</dt>
            <dd className="font-medium text-white">{residentName}</dd>
          </div>
          {breakdown.roomChargesPaidPaise > 0 ? (
            <div className="flex justify-between gap-3">
              <dt className="text-apg-silver">Room Charges</dt>
              <dd className="font-medium tabular-nums text-white">
                {paiseToInr(breakdown.roomChargesPaidPaise)}
              </dd>
            </div>
          ) : null}
          {breakdown.depositPaidPaise > 0 ? (
            <div className="flex justify-between gap-3">
              <dt className="text-apg-silver">Security Deposit</dt>
              <dd className="font-medium tabular-nums text-white">
                {paiseToInr(breakdown.depositPaidPaise)}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3 border-t border-white/10 pt-2">
            <dt className="font-semibold text-white">Total Payment</dt>
            <dd className="text-base font-semibold tabular-nums text-emerald-300">
              {paiseToInr(breakdown.receivedPaise)}
            </dd>
          </div>
        </dl>

        <div className="mt-4 rounded-xl border border-white/10 bg-[#121820] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-apg-silver">
            This approval will
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-apg-silver">
            {effects.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="text-emerald-400">✓</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-apg-silver hover:bg-white/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
            style={{ backgroundColor: OPS_ORANGE }}
          >
            {pending ? 'Approving…' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}

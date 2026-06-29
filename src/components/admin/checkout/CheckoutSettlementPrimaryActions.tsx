'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { assessCheckoutSettlementReadiness } from '@/src/lib/checkout/checkoutSettlementReadiness';
import {
  rejectCheckoutSettlementSubmissionAction,
  type CheckoutSettlementActionState,
} from '@/app/(admin)/admin/checkout-settlements/actions';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

const PRIMARY =
  'inline-flex items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110';
const SECONDARY =
  'inline-flex items-center justify-center rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/5';
const REJECT_BTN =
  'inline-flex items-center justify-center rounded-lg border border-rose-400/40 px-4 py-2.5 text-sm font-medium text-rose-100 hover:bg-rose-500/10';

const idle: CheckoutSettlementActionState = { status: 'idle' };

export function CheckoutSettlementPrimaryActions({ detail }: { detail: CheckoutSettlementDetail }) {
  const readiness = assessCheckoutSettlementReadiness(detail);
  const zeroRefund = detail.preview.finalRefundPaise <= 0;
  const canApprove = readiness.ready;
  const canMarkPaid = detail.status === 'refund_pending' && !zeroRefund;
  const canReject = detail.status === 'awaiting_admin_review';
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectCheckoutSettlementSubmissionAction,
    idle,
  );

  return (
    <section className="mb-8 rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <h2 className="text-base font-semibold text-white">What to do next</h2>
      <p className="mt-1 text-sm text-apg-silver">
        {canApprove
          ? zeroRefund
            ? 'Deductions consume the full deposit — complete checkout to apply ledger entries and release the bed.'
            : 'Check electricity and notice fee below, then approve the final refund.'
          : canMarkPaid
            ? 'Send the refund to the resident’s UPI ID, then mark it paid with the transaction reference.'
            : canReject
              ? 'Review meter photo and UPI details. Reject if anything is missing or incorrect — the resident can resubmit.'
              : detail.status === 'awaiting_resident_details'
                ? zeroRefund
                  ? 'Electricity must be settled, then use Complete checkout — no UPI required when refund is ₹0.'
                  : 'Waiting for the resident to submit UPI details and meter information.'
                : 'This checkout is finished or waiting on another step.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {canApprove ? (
          <a href="#approve-settlement" className={PRIMARY}>
            {zeroRefund ? 'Complete checkout' : 'Approve refund amount'}
          </a>
        ) : null}
        {canMarkPaid ? (
          <a href="#mark-refund-paid" className={PRIMARY}>
            Mark refund sent
          </a>
        ) : null}
        <Link href={`/admin/residents/${detail.customerId}`} className={SECONDARY}>
          Resident profile
        </Link>
        <Link href={`/admin/deposits/${detail.bookingId}`} className={SECONDARY}>
          Security deposit
        </Link>
        <Link href="/admin/vacating?status=pending" className={SECONDARY}>
          Move-out requests
        </Link>
      </div>

      {canReject ? (
        <form action={rejectAction} className="mt-6 space-y-3 rounded-xl border border-rose-400/20 bg-rose-500/5 p-4">
          <input type="hidden" name="settlementId" value={detail.id} />
          <p className="text-sm font-medium text-rose-100">Reject refund request</p>
          <p className="text-xs text-apg-silver">
            Use when details are incomplete or incorrect. This does not cancel the booking — the
            resident can submit again.
          </p>
          <textarea
            name="rejectionReason"
            required
            rows={3}
            placeholder="e.g. Meter photo is blurry — please upload a clear final reading."
            className="apg-admin-field w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
          />
          <button type="submit" disabled={rejectPending} className={REJECT_BTN}>
            {rejectPending ? 'Rejecting…' : 'Reject refund request'}
          </button>
          {rejectState.status === 'error' ? (
            <p className="text-xs text-rose-300">{rejectState.message}</p>
          ) : null}
          {rejectState.status === 'ok' ? (
            <p className="text-xs text-emerald-300">{rejectState.message}</p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}

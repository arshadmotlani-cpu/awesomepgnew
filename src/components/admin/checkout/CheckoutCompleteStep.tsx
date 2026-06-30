'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  approveCheckoutSettlementAction,
  markCheckoutRefundPaidAction,
  rejectCheckoutSettlementSubmissionAction,
  type CheckoutSettlementActionState,
} from '@/app/(admin)/admin/checkout-settlements/actions';
import { CheckoutPaymentPanel } from '@/src/components/admin/checkout/CheckoutPaymentPanel';
import { CheckoutRefundReceiptFromDetail } from '@/src/components/admin/checkout/CheckoutRefundReceipt';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

const idle: CheckoutSettlementActionState = { status: 'idle' };

const PRIMARY =
  'inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#FF5A1F] px-8 py-3.5 text-base font-semibold text-white shadow-[0_12px_40px_rgba(255,90,31,0.22)] transition hover:brightness-110 disabled:opacity-50';

const REJECT =
  'inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-rose-400/30 px-5 py-2.5 text-sm font-medium text-rose-100 hover:bg-rose-500/10 disabled:opacity-50';

type SentChoice = 'yes' | 'no' | null;

export function CheckoutCompleteStep({
  detail,
  canApprove,
  canMarkPaid,
  canReject,
  readinessReady,
  blockingReasons,
  zeroRefund,
}: {
  detail: CheckoutSettlementDetail;
  canApprove: boolean;
  canMarkPaid: boolean;
  canReject: boolean;
  readinessReady: boolean;
  blockingReasons: string[];
  zeroRefund: boolean;
}) {
  const router = useRouter();
  const preview = detail.preview;
  const isFinished =
    detail.status === 'completed' ||
    detail.status === 'refund_paid' ||
    (detail.amountsLocked && zeroRefund);

  const [sentChoice, setSentChoice] = useState<SentChoice>(zeroRefund ? 'yes' : null);
  const [upiRef, setUpiRef] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [rejectPending, startReject] = useTransition();

  const needsPaymentConfirm = !zeroRefund && (canApprove || canMarkPaid);
  const canSubmit =
    isFinished ||
    (canMarkPaid
      ? sentChoice === 'yes'
      : canApprove
        ? readinessReady && (zeroRefund || sentChoice === 'yes')
        : false);

  function buildApproveFormData(): FormData {
    const fd = new FormData();
    fd.set('settlementId', detail.id);
    fd.set('noticeDeductionInr', (detail.noticeDeductionPaise / 100).toFixed(2));
    fd.set('skipElectricityShare', preview.electricityDeductFromDeposit ? 'no' : 'yes');
    if (preview.electricityDeductFromDeposit) {
      fd.set('electricityShareInr', (preview.electricityDeductionPaise / 100).toFixed(2));
    }
    fd.set('damageChargeInr', (detail.damageChargePaise / 100).toFixed(2));
    fd.set('cleaningChargeInr', (detail.cleaningChargePaise / 100).toFixed(2));
    fd.set('customChargeInr', (detail.customChargePaise / 100).toFixed(2));
    return fd;
  }

  function buildRefundFormData(): FormData {
    const fd = new FormData();
    fd.set('settlementId', detail.id);
    const ref = upiRef.trim();
    fd.set('refundReference', ref || 'confirmed-without-reference');
    return fd;
  }

  function onComplete() {
    setError(null);
    startTransition(async () => {
      try {
        if (canMarkPaid) {
          const refundResult = await markCheckoutRefundPaidAction(idle, buildRefundFormData());
          if (refundResult.status === 'error') {
            setError(refundResult.message);
            return;
          }
          router.refresh();
          return;
        }

        if (canApprove) {
          const approveResult = await approveCheckoutSettlementAction(idle, buildApproveFormData());
          if (approveResult.status === 'error') {
            setError(approveResult.message);
            return;
          }
          if (!zeroRefund) {
            const refundResult = await markCheckoutRefundPaidAction(idle, buildRefundFormData());
            if (refundResult.status === 'error') {
              setError(refundResult.message);
              return;
            }
          }
          router.refresh();
        }
      } catch {
        setError('Something went wrong. Try again.');
      }
    });
  }

  function onReject(formData: FormData) {
    setError(null);
    startReject(async () => {
      const result = await rejectCheckoutSettlementSubmissionAction(idle, formData);
      if (result.status === 'error') setError(result.message);
      else router.refresh();
    });
  }

  if (isFinished) {
    return (
      <div className="space-y-8">
        <CheckoutRefundReceiptFromDetail detail={detail} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {needsPaymentConfirm ? (
        <CheckoutPaymentPanel
          refundPaise={preview.finalRefundPaise}
          upiId={detail.payoutUpiId}
          evidence={detail.refundQrEvidence}
          customerName={detail.customerName}
        />
      ) : null}

      {needsPaymentConfirm ? (
        <fieldset className="space-y-4 rounded-3xl bg-[#1A1F27]/80 p-8 ring-1 ring-white/[0.06]">
          <legend className="text-base font-medium text-white">Have you already sent the refund?</legend>
          <div className="flex flex-wrap gap-4">
            {(['yes', 'no'] as const).map((value) => (
              <label
                key={value}
                className={
                  'flex cursor-pointer items-center gap-3 rounded-2xl px-5 py-4 ring-1 transition ' +
                  (sentChoice === value
                    ? 'bg-white/[0.08] ring-white/20'
                    : 'ring-white/[0.06] hover:bg-white/[0.04]')
                }
              >
                <input
                  type="radio"
                  name="refundSent"
                  value={value}
                  checked={sentChoice === value}
                  onChange={() => setSentChoice(value)}
                  className="h-4 w-4 border-white/30 text-[#FF5A1F]"
                />
                <span className="text-sm font-medium capitalize text-white">{value}</span>
              </label>
            ))}
          </div>
          {sentChoice === 'no' ? (
            <p className="text-sm text-amber-200">
              Send the refund using the QR or UPI above, verify it succeeded, then select Yes.
            </p>
          ) : null}
          {sentChoice === 'yes' ? (
            <label className="block text-sm">
              <span className="text-apg-silver">UPI transaction reference (optional)</span>
              <input
                value={upiRef}
                onChange={(e) => setUpiRef(e.target.value)}
                placeholder="e.g. 123456789012"
                className="apg-admin-field mt-2 w-full rounded-2xl border border-white/10 bg-[#12161C] px-4 py-3.5 text-white"
              />
            </label>
          ) : null}
        </fieldset>
      ) : null}

      {!zeroRefund && !needsPaymentConfirm && canApprove ? (
        <p className="text-sm text-apg-silver">Confirm deductions and complete checkout.</p>
      ) : null}

      <button
        type="button"
        onClick={onComplete}
        disabled={pending || !canSubmit}
        className={PRIMARY}
      >
        {pending ? 'Completing…' : 'Approve & complete checkout'}
      </button>

      {!readinessReady && canApprove && !canMarkPaid ? (
        <p className="text-sm text-amber-200">
          Complete earlier steps first: {blockingReasons.join(' · ')}
        </p>
      ) : null}

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {canReject ? (
        <form
          className="space-y-3 border-t border-white/[0.06] pt-8"
          onSubmit={(e) => {
            e.preventDefault();
            onReject(new FormData(e.currentTarget));
          }}
        >
          <input type="hidden" name="settlementId" value={detail.id} />
          <p className="text-sm text-apg-silver">Wrong photos or UPI? Return to resident to fix.</p>
          <textarea
            name="rejectionReason"
            required
            rows={2}
            placeholder="What should they fix?"
            className="apg-admin-field w-full rounded-2xl border border-white/10 bg-[#12161C] px-4 py-3 text-sm text-white"
          />
          <button type="submit" disabled={rejectPending} className={REJECT}>
            {rejectPending ? 'Rejecting…' : 'Reject request'}
          </button>
        </form>
      ) : null}
    </div>
  );
}

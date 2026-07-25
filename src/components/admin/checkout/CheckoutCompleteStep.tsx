'use client';

import { useRef, useState, useTransition } from 'react';
import { RECORD_PAYOUT_CTA } from '@/src/lib/payout/payoutDisplayTerminology';
import { useRouter } from 'next/navigation';
import {
  completeCheckoutSettlementAction,
  deferCheckoutRefundPayoutAction,
  markCheckoutRefundPaidAction,
  rejectCheckoutSettlementSubmissionAction,
} from '@/app/(admin)/admin/checkout-settlements/actions';
import type { CheckoutSettlementActionState } from '@/src/lib/checkout/checkoutSettlementActionTypes';
import {
  CHECKOUT_COMPLETE_SUCCESS_MESSAGE,
  CHECKOUT_DEFER_SUCCESS_MESSAGE,
} from '@/src/lib/checkout/checkoutSettlementActionTypes';
import { CHECKOUT_COMPLETE_LOADING_LABEL } from '@/src/components/admin/checkout/checkoutCompleteUi';
import {
  resolveCheckoutCompleteAfterClientThrow,
  resolveCheckoutCompleteClientOutcome,
} from '@/src/components/admin/checkout/resolveCheckoutCompleteClientOutcome';
import { CheckoutPaymentPanel } from '@/src/components/admin/checkout/CheckoutPaymentPanel';
import { useCheckoutElectricityDraft } from '@/src/components/admin/checkout/CheckoutElectricityDraftContext';
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
  onSuccess,
}: {
  detail: CheckoutSettlementDetail;
  canApprove: boolean;
  canMarkPaid: boolean;
  canReject: boolean;
  readinessReady: boolean;
  blockingReasons: string[];
  zeroRefund: boolean;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const preview = detail.preview;
  const { livePreview } = useCheckoutElectricityDraft();
  const electricityDeductionPaise =
    livePreview?.electricityDeductionPaise ?? preview.electricityDeductionPaise;
  const finalRefundPaise =
    livePreview?.electricityDeductionPaise != null
      ? Math.max(
          0,
          detail.depositRefundablePaise -
            preview.noticeDeductionPaise -
            (preview.electricityDeductFromDeposit ? electricityDeductionPaise : 0) -
            (preview.damageChargePaise ?? 0) -
            ((preview.cleaningChargePaise ?? 0) + (preview.customChargePaise ?? 0)),
        )
      : preview.finalRefundPaise;
  const isFinished =
    detail.status === 'completed' ||
    detail.status === 'refund_paid' ||
    (detail.amountsLocked && zeroRefund);

  const [sentChoice, setSentChoice] = useState<SentChoice>(zeroRefund ? 'yes' : null);
  const [upiRef, setUpiRef] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const completeInFlightRef = useRef(false);
  const [pending, startTransition] = useTransition();
  const [rejectPending, startReject] = useTransition();

  const completeBusy = completing || pending;

  const needsPaymentConfirm = !zeroRefund && (canApprove || canMarkPaid);
  const deferPayout = canApprove && !canMarkPaid && sentChoice === 'no';

  const canSubmit =
    isFinished ||
    (canMarkPaid
      ? sentChoice === 'yes'
      : canApprove
        ? readinessReady && (zeroRefund || sentChoice === 'yes' || sentChoice === 'no')
        : false);

  function buildApproveFormData(): FormData {
    const fd = new FormData();
    fd.set('settlementId', detail.id);
    fd.set('noticeDeductionInr', (detail.noticeDeductionPaise / 100).toFixed(2));
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

  function finishSuccess(message: string, redirectHref: string) {
    onSuccess(message);
    router.push(redirectHref);
  }

  function primaryLabel(): string {
    if (completeBusy) return CHECKOUT_COMPLETE_LOADING_LABEL;
    if (canMarkPaid) return RECORD_PAYOUT_CTA;
    if (zeroRefund) return 'Complete checkout';
    if (deferPayout) return 'Finalize checkout & queue refund';
    return 'Pay & complete checkout';
  }

  function onComplete() {
    if (completeInFlightRef.current || completeBusy || isFinished) {
      return;
    }
    completeInFlightRef.current = true;
    setCompleting(true);
    setError(null);
    startTransition(async () => {
      try {
        let result: CheckoutSettlementActionState;
        if (canMarkPaid) {
          result = await markCheckoutRefundPaidAction(idle, buildRefundFormData());
          const outcome = await resolveCheckoutCompleteClientOutcome({
            settlementId: detail.id,
            result,
          });
          if (outcome.kind === 'success') {
            finishSuccess(CHECKOUT_COMPLETE_SUCCESS_MESSAGE, '/admin/operations?filter=refund_due');
            return;
          }
          setError(outcome.message);
          return;
        }

        if (canApprove && deferPayout) {
          result = await deferCheckoutRefundPayoutAction(idle, buildApproveFormData());
          if (result.status === 'ok') {
            finishSuccess(
              result.message ?? CHECKOUT_DEFER_SUCCESS_MESSAGE,
              '/admin/operations?filter=refund_due',
            );
            return;
          }
          setError(result.status === 'error' ? result.message : 'Could not defer payout');
          return;
        }

        if (canApprove) {
          const fd = buildApproveFormData();
          fd.set('refundReference', upiRef.trim() || 'confirmed-without-reference');
          result = await completeCheckoutSettlementAction(idle, fd);
        } else {
          return;
        }

        const outcome = await resolveCheckoutCompleteClientOutcome({
          settlementId: detail.id,
          result,
        });
        if (outcome.kind === 'success') {
          finishSuccess(CHECKOUT_COMPLETE_SUCCESS_MESSAGE, '/admin/operations?filter=checkout');
          return;
        }
        setError(outcome.message);
      } catch (err) {
        console.error('[checkout] Pay & complete failed', err);
        const outcome = await resolveCheckoutCompleteAfterClientThrow({
          settlementId: detail.id,
          err,
        });
        if (outcome.kind === 'success') {
          const href = canMarkPaid || deferPayout
            ? '/admin/operations?filter=refund_due'
            : '/admin/operations?filter=checkout';
          finishSuccess(CHECKOUT_COMPLETE_SUCCESS_MESSAGE, href);
          return;
        }
        setError(outcome.message);
      } finally {
        completeInFlightRef.current = false;
        setCompleting(false);
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
          refundPaise={finalRefundPaise}
          upiId={detail.payoutUpiId}
          evidence={detail.refundQrEvidence}
          customerName={detail.customerName}
        />
      ) : null}

      {needsPaymentConfirm && canApprove && !canMarkPaid ? (
        <fieldset
          disabled={completeBusy}
          className="space-y-4 rounded-3xl bg-[#1A1F27]/80 p-8 ring-1 ring-white/[0.06] disabled:opacity-60"
        >
          <legend className="text-base font-medium text-white">
            Have you already sent the refund?
          </legend>
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
                <span className="text-sm font-medium text-white">
                  {value === 'yes' ? 'Yes — refund already paid' : 'Not yet — queue for payout'}
                </span>
              </label>
            ))}
          </div>
          {sentChoice === 'no' ? (
            <p className="text-sm text-amber-200">
              Checkout will be finalized now (bed released, charges locked). Record the UPI payout
              later from Operations → Pending payouts.
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

      {needsPaymentConfirm && canMarkPaid ? (
        <fieldset
          disabled={completeBusy}
          className="space-y-4 rounded-3xl bg-[#1A1F27]/80 p-8 ring-1 ring-white/[0.06] disabled:opacity-60"
        >
          <legend className="text-base font-medium text-white">{RECORD_PAYOUT_CTA}</legend>
          <p className="text-sm text-apg-silver">
            Checkout is finalized. Enter the UPI reference after you send the refund.
          </p>
          <label className="block text-sm">
            <span className="text-apg-silver">UPI transaction reference</span>
            <input
              value={upiRef}
              onChange={(e) => setUpiRef(e.target.value)}
              placeholder="e.g. 123456789012"
              className="apg-admin-field mt-2 w-full rounded-2xl border border-white/10 bg-[#12161C] px-4 py-3.5 text-white"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-white">
            <input
              type="checkbox"
              checked={sentChoice === 'yes'}
              onChange={(e) => setSentChoice(e.target.checked ? 'yes' : null)}
              className="h-4 w-4 border-white/30 text-[#FF5A1F]"
            />
            Refund sent — ready to record
          </label>
        </fieldset>
      ) : null}

      {!zeroRefund && !needsPaymentConfirm && canApprove ? (
        <p className="text-sm text-apg-silver">Confirm deductions and complete checkout.</p>
      ) : null}

      <button
        type="button"
        onClick={onComplete}
        disabled={completeBusy || !canSubmit}
        aria-busy={completeBusy}
        className={PRIMARY}
      >
        {primaryLabel()}
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

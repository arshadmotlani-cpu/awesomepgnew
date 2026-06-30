'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  approveCheckoutSettlementAction,
  markCheckoutRefundPaidAction,
  rejectCheckoutSettlementSubmissionAction,
  type CheckoutSettlementActionState,
} from '@/app/(admin)/admin/checkout-settlements/actions';
import { CheckoutSettlementElectricitySection } from '@/src/components/admin/CheckoutSettlementElectricitySection';
import { CheckoutSettlementEvidenceCard } from '@/src/components/admin/checkout/CheckoutSettlementEvidenceCard';
import { assessCheckoutSettlementReadiness } from '@/src/lib/checkout/checkoutSettlementReadiness';
import { paiseToInr } from '@/src/lib/format';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

const idle: CheckoutSettlementActionState = { status: 'idle' };

const PRIMARY =
  'inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-[#FF5A1F] px-8 py-3 text-base font-semibold text-white shadow-[0_12px_40px_rgba(255,90,31,0.25)] transition hover:brightness-110 disabled:opacity-50';

const SECONDARY =
  'inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-white/15 px-6 py-2.5 text-sm font-medium text-white hover:bg-white/5';

type WizardStep = 1 | 2 | 3 | 4;

function stepLabel(step: WizardStep, detail: CheckoutSettlementDetail): string {
  if (detail.status === 'awaiting_resident_details') {
    return step === 1 ? 'Waiting on resident' : '';
  }
  switch (step) {
    case 1:
      return 'Resident submission';
    case 2:
      return 'Electricity';
    case 3:
      return 'Refund summary';
    case 4:
      return 'Complete';
    default:
      return '';
  }
}

export function CheckoutSettlementWizard({ detail }: { detail: CheckoutSettlementDetail }) {
  const router = useRouter();
  const readiness = assessCheckoutSettlementReadiness(detail);
  const preview = detail.preview;
  const zeroRefund = preview.finalRefundPaise <= 0;
  const waitingResident = detail.status === 'awaiting_resident_details';
  const canApprove = readiness.ready && !detail.amountsLocked;
  const canMarkPaid = detail.status === 'refund_pending' && !zeroRefund;
  const canReject = detail.status === 'awaiting_admin_review';
  const canEditElectricity =
    !detail.amountsLocked &&
    (detail.status === 'awaiting_admin_review' || detail.status === 'awaiting_resident_details');

  const initialStep: WizardStep = waitingResident
    ? 1
    : canMarkPaid
      ? 4
      : detail.status === 'awaiting_admin_review'
        ? 1
        : 3;
  const [step, setStep] = useState<WizardStep>(initialStep);

  const [approveState, approveAction, approvePending] = useActionState(
    approveCheckoutSettlementAction,
    idle,
  );
  const [refundState, refundAction, refundPending] = useActionState(
    markCheckoutRefundPaidAction,
    idle,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectCheckoutSettlementSubmissionAction,
    idle,
  );

  useEffect(() => {
    if (approveState.status === 'ok' || refundState.status === 'ok' || rejectState.status === 'ok') {
      router.refresh();
    }
  }, [approveState.status, refundState.status, rejectState.status, router]);

  const steps = useMemo(() => {
    if (waitingResident) return [1] as WizardStep[];
    return [1, 2, 3, 4] as WizardStep[];
  }, [waitingResident]);

  return (
    <div className="mx-auto max-w-3xl space-y-10 pb-16">
      <header className="space-y-2">
        <p className="text-sm text-apg-silver">Move-out checkout</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">{detail.customerName}</h1>
        <p className="text-sm text-apg-silver">
          {detail.pgName} · Room {detail.roomNumber} · {detail.bedCode}
        </p>
      </header>

      {!waitingResident ? (
        <nav className="flex flex-wrap gap-2">
          {steps.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStep(s)}
              className={
                'rounded-full px-4 py-2 text-sm font-medium transition ' +
                (step === s
                  ? 'bg-white text-[#12161C]'
                  : 'bg-white/5 text-apg-silver hover:bg-white/10 hover:text-white')
              }
            >
              {s}. {stepLabel(s, detail)}
            </button>
          ))}
        </nav>
      ) : null}

      {step === 1 ? (
        <section className="space-y-6 rounded-3xl bg-[#1A1F27]/80 p-8 ring-1 ring-white/[0.06]">
          <h2 className="text-xl font-semibold text-white">What the resident sent</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <CheckoutSettlementEvidenceCard
              title="Meter photo"
              evidence={detail.meterPhotoEvidence}
              fallback={
                detail.electricityUseAverage
                  ? 'Using average bill'
                  : 'Not uploaded yet'
              }
            />
            <CheckoutSettlementEvidenceCard
              title="Refund QR / UPI"
              evidence={detail.refundQrEvidence}
              fallback={detail.payoutUpiId?.trim() ? `UPI: ${detail.payoutUpiId}` : 'Not submitted'}
            />
          </div>
          {waitingResident ? (
            <p className="text-sm text-sky-200">
              Waiting for the resident to upload their meter photo and refund details. You&apos;ll be
              notified when they&apos;re done.
            </p>
          ) : (
            <button type="button" onClick={() => setStep(2)} className={PRIMARY}>
              Continue to electricity
            </button>
          )}
        </section>
      ) : null}

      {step === 2 && canEditElectricity ? (
        <section className="space-y-6 rounded-3xl bg-[#1A1F27]/80 p-8 ring-1 ring-white/[0.06]">
          <h2 className="text-xl font-semibold text-white">Electricity</h2>
          <p className="text-sm text-apg-silver">
            Pick how to bill the final month. Amounts update as you type.
          </p>
          <CheckoutSettlementElectricitySection detail={detail} editable operatorMode />
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setStep(3)} className={PRIMARY}>
              Continue to refund summary
            </button>
            <button type="button" onClick={() => setStep(1)} className={SECONDARY}>
              Back
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-6 rounded-3xl bg-[#1A1F27]/80 p-8 ring-1 ring-white/[0.06]">
          <h2 className="text-xl font-semibold text-white">Refund summary</h2>
          <dl className="space-y-4 text-sm">
            <Row label="Deposit held" value={paiseToInr(detail.depositRefundablePaise)} />
            <Row label="Notice fee" value={paiseToInr(preview.noticeDeductionPaise)} />
            <Row label="Electricity" value={paiseToInr(preview.electricityDeductionPaise)} />
            <Row label="Other charges" value={paiseToInr(
              (preview.damageChargePaise ?? 0) +
                (preview.cleaningChargePaise ?? 0) +
                (preview.customChargePaise ?? 0),
            )} />
            <div className="border-t border-white/10 pt-4">
              <Row
                label="Final refund to resident"
                value={paiseToInr(preview.finalRefundPaise)}
                accent
              />
            </div>
          </dl>
          <div className="flex flex-wrap gap-3">
            {!waitingResident ? (
              <button type="button" onClick={() => setStep(4)} className={PRIMARY}>
                Continue to complete
              </button>
            ) : null}
            {canEditElectricity ? (
              <button type="button" onClick={() => setStep(2)} className={SECONDARY}>
                Back to electricity
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="space-y-6 rounded-3xl bg-[#1A1F27]/80 p-8 ring-1 ring-white/[0.06]">
          <h2 className="text-xl font-semibold text-white">
            {canMarkPaid ? 'Send refund' : 'Complete checkout'}
          </h2>

          {canApprove ? (
            <form action={approveAction} className="space-y-4">
              <input type="hidden" name="settlementId" value={detail.id} />
              <p className="text-sm text-apg-silver">
                {zeroRefund
                  ? 'Deposit covers all charges — completing will release the bed.'
                  : `Approve ₹${(preview.finalRefundPaise / 100).toFixed(0)} refund to the resident.`}
              </p>
              <button type="submit" disabled={approvePending} className={PRIMARY}>
                {approvePending
                  ? 'Working…'
                  : zeroRefund
                    ? 'Approve & complete checkout'
                    : 'Approve & complete checkout'}
              </button>
              {approveState.status === 'error' ? (
                <p className="text-sm text-rose-300">{approveState.message}</p>
              ) : null}
            </form>
          ) : null}

          {canMarkPaid ? (
            <form action={refundAction} className="space-y-4">
              <input type="hidden" name="settlementId" value={detail.id} />
              <label className="block text-sm">
                <span className="text-apg-silver">UPI reference after you send money</span>
                <input
                  name="refundReference"
                  required
                  placeholder="e.g. 123456789012"
                  className="apg-admin-field mt-2 w-full rounded-xl border border-white/10 bg-[#12161C] px-4 py-3 text-white"
                />
              </label>
              <button type="submit" disabled={refundPending} className={PRIMARY}>
                {refundPending ? 'Saving…' : 'Mark refund sent'}
              </button>
              {refundState.status === 'error' ? (
                <p className="text-sm text-rose-300">{refundState.message}</p>
              ) : null}
            </form>
          ) : null}

          {canReject ? (
            <form action={rejectAction} className="mt-8 space-y-3 border-t border-white/10 pt-8">
              <input type="hidden" name="settlementId" value={detail.id} />
              <p className="text-sm font-medium text-white">Reject request</p>
              <p className="text-xs text-apg-silver">
                Resident can fix and resubmit — use if photos or UPI details are wrong.
              </p>
              <textarea
                name="rejectionReason"
                required
                rows={3}
                placeholder="Tell the resident what to fix…"
                className="apg-admin-field w-full rounded-xl border border-white/10 bg-[#12161C] px-4 py-3 text-sm text-white"
              />
              <button
                type="submit"
                disabled={rejectPending}
                className="inline-flex min-h-[44px] items-center rounded-2xl border border-rose-400/40 px-6 py-2.5 text-sm font-medium text-rose-100 hover:bg-rose-500/10"
              >
                {rejectPending ? 'Rejecting…' : 'Reject request'}
              </button>
              {rejectState.status === 'error' ? (
                <p className="text-xs text-rose-300">{rejectState.message}</p>
              ) : null}
            </form>
          ) : null}

          {!canApprove && !canMarkPaid && !canReject ? (
            <p className="text-sm text-apg-silver">This checkout is finished or waiting on another step.</p>
          ) : null}

          <Link href="/admin/operations/residents" className="inline-block text-sm text-apg-silver hover:text-white">
            ← Back to today&apos;s work
          </Link>
        </section>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-apg-silver">{label}</dt>
      <dd className={accent ? 'text-2xl font-semibold text-emerald-300' : 'font-medium text-white'}>
        {value}
      </dd>
    </div>
  );
}

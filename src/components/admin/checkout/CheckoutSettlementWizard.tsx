'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  approveCheckoutSettlementAction,
  markCheckoutRefundPaidAction,
  rejectCheckoutSettlementSubmissionAction,
  type CheckoutSettlementActionState,
} from '@/app/(admin)/admin/checkout-settlements/actions';
import {
  CheckoutSettlementElectricitySection,
  type ElectricityLivePreview,
} from '@/src/components/admin/CheckoutSettlementElectricitySection';
import { CheckoutRefundSummaryRail } from '@/src/components/admin/checkout/CheckoutRefundSummaryRail';
import { CheckoutSettlementEvidenceLarge } from '@/src/components/admin/checkout/CheckoutSettlementEvidenceLarge';
import { assessCheckoutSettlementReadiness } from '@/src/lib/checkout/checkoutSettlementReadiness';
import { formatDateTime } from '@/src/lib/format';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

const idle: CheckoutSettlementActionState = { status: 'idle' };

const PRIMARY =
  'inline-flex min-h-[52px] items-center justify-center rounded-2xl bg-[#FF5A1F] px-8 py-3.5 text-base font-semibold text-white shadow-[0_12px_40px_rgba(255,90,31,0.22)] transition hover:brightness-110 disabled:opacity-50';

const NEUTRAL =
  'inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-medium text-white transition hover:bg-white/[0.08]';

const REJECT =
  'inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-rose-400/30 px-6 py-3 text-sm font-medium text-rose-100 transition hover:bg-rose-500/10 disabled:opacity-50';

type WizardStep = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<WizardStep, string> = {
  1: 'Resident submission',
  2: 'Electricity',
  3: 'Refund summary',
  4: 'Complete',
};

function submissionTime(detail: CheckoutSettlementDetail): string {
  if (detail.status === 'awaiting_resident_details') return 'Not submitted yet';
  return formatDateTime(detail.updatedAt);
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
      ? 3
      : detail.status === 'awaiting_admin_review'
        ? 1
        : 3;
  const [step, setStep] = useState<WizardStep>(initialStep);
  const [liveElectricity, setLiveElectricity] = useState<ElectricityLivePreview | null>(null);

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

  useEffect(() => {
    if (approveState.status === 'ok' && !zeroRefund) {
      setStep(3);
    }
  }, [approveState.status, zeroRefund]);

  const steps = useMemo(() => {
    if (waitingResident) return [1] as WizardStep[];
    return [1, 2, 3, 4] as WizardStep[];
  }, [waitingResident]);

  const showStickySummary = !waitingResident && step === 2;
  const electricityOverride = liveElectricity?.electricityDeductionPaise;

  return (
    <div className="pb-20">
      <div className="lg:flex lg:items-start lg:gap-10">
        <div className="min-w-0 flex-1 space-y-10">
          {!waitingResident ? (
            <nav aria-label="Checkout steps" className="overflow-x-auto">
              <ol className="flex min-w-max items-center gap-2">
                {steps.map((s, index) => {
                  const active = step === s;
                  const done = step > s;
                  return (
                    <li key={s} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setStep(s)}
                        className={
                          'flex items-center gap-3 rounded-2xl px-4 py-2.5 text-left transition ' +
                          (active
                            ? 'bg-white text-[#12161C]'
                            : done
                              ? 'text-white hover:bg-white/[0.06]'
                              : 'text-apg-silver hover:bg-white/[0.04] hover:text-white')
                        }
                      >
                        <span
                          className={
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ' +
                            (active
                              ? 'bg-[#12161C] text-white'
                              : done
                                ? 'bg-emerald-500/20 text-emerald-200'
                                : 'bg-white/10')
                          }
                        >
                          {done ? '✓' : s}
                        </span>
                        <span className="hidden text-sm font-medium sm:inline">{STEP_LABELS[s]}</span>
                      </button>
                      {index < steps.length - 1 ? (
                        <span className="h-px w-6 bg-white/10 sm:w-10" aria-hidden />
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </nav>
          ) : null}

          {step === 1 ? (
            <section className="space-y-8">
              <div className="rounded-3xl bg-[#1A1F27]/80 p-8 ring-1 ring-white/[0.06]">
                <h2 className="text-2xl font-semibold tracking-tight text-white">
                  Verify resident submission
                </h2>
                <p className="mt-2 text-sm text-apg-silver">
                  Check that the meter photo and refund details are correct before calculating
                  electricity.
                </p>

                <dl className="mt-8 grid gap-5 sm:grid-cols-2">
                  <InfoCell label="Resident" value={detail.customerName} />
                  <InfoCell label="PG" value={detail.pgName} />
                  <InfoCell label="Room" value={detail.roomNumber} />
                  <InfoCell label="Bed" value={detail.bedCode} />
                  <InfoCell label="Submitted" value={submissionTime(detail)} className="sm:col-span-2" />
                </dl>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <CheckoutSettlementEvidenceLarge
                  title="Meter photo"
                  evidence={detail.meterPhotoEvidence}
                  emptyLabel={
                    detail.electricityUseAverage
                      ? 'Resident chose average billing — no meter photo'
                      : 'Meter photo not uploaded yet'
                  }
                />
                <CheckoutSettlementEvidenceLarge
                  title="Refund QR"
                  evidence={detail.refundQrEvidence}
                  emptyLabel="Refund QR not uploaded yet"
                />
              </div>

              {detail.payoutUpiId?.trim() ? (
                <div className="rounded-3xl bg-[#1A1F27]/80 px-8 py-6 ring-1 ring-white/[0.06]">
                  <p className="text-xs font-medium uppercase tracking-wider text-apg-silver">UPI ID</p>
                  <p className="mt-2 font-mono text-xl text-white">{detail.payoutUpiId}</p>
                </div>
              ) : null}

              {waitingResident ? (
                <p className="text-sm text-sky-200">
                  Waiting for the resident to upload their meter photo and refund details.
                </p>
              ) : (
                <button type="button" onClick={() => setStep(2)} className={PRIMARY}>
                  Continue to electricity
                </button>
              )}
            </section>
          ) : null}

          {step === 2 && canEditElectricity ? (
            <section className="space-y-8">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-white">Electricity</h2>
                <p className="mt-2 text-sm text-apg-silver">
                  Choose how to bill the final month. Amounts save automatically as you type.
                </p>
              </div>

              <div className="rounded-3xl bg-[#1A1F27]/80 p-8 ring-1 ring-white/[0.06]">
                <CheckoutSettlementElectricitySection
                  detail={detail}
                  editable
                  operatorMode
                  autoSave
                  onLivePreviewChange={setLiveElectricity}
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => setStep(3)} className={PRIMARY}>
                  Continue to refund summary
                </button>
                <button type="button" onClick={() => setStep(1)} className={NEUTRAL}>
                  Back
                </button>
              </div>
            </section>
          ) : null}

          {step === 2 && !canEditElectricity ? (
            <section className="space-y-6">
              <p className="text-sm text-apg-silver">Electricity has already been calculated.</p>
              <button type="button" onClick={() => setStep(3)} className={PRIMARY}>
                View refund summary
              </button>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="space-y-8">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-white">Refund summary</h2>
                <p className="mt-2 text-sm text-apg-silver">
                  {zeroRefund
                    ? 'Deposit covers all charges — no refund to send.'
                    : 'Send the refund using the QR or UPI below, then complete checkout.'}
                </p>
              </div>

              <div className="lg:hidden">
                <CheckoutRefundSummaryRail
                  detail={detail}
                  overrides={
                    electricityOverride != null
                      ? { electricityDeductionPaise: electricityOverride }
                      : undefined
                  }
                  showPayment={!zeroRefund}
                  qrSize="large"
                />
              </div>

              {!zeroRefund ? (
                <div className="hidden rounded-3xl bg-[#1A1F27]/80 p-8 ring-1 ring-white/[0.06] lg:block">
                  <CheckoutRefundSummaryRail
                    detail={detail}
                    overrides={
                      electricityOverride != null
                        ? { electricityDeductionPaise: electricityOverride }
                        : undefined
                    }
                    showPayment
                    qrSize="large"
                  />
                </div>
              ) : (
                <div className="hidden rounded-3xl bg-[#1A1F27]/80 p-8 ring-1 ring-white/[0.06] lg:block">
                  <CheckoutRefundSummaryRail
                    detail={detail}
                    overrides={
                      electricityOverride != null
                        ? { electricityDeductionPaise: electricityOverride }
                        : undefined
                    }
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                {canMarkPaid || canApprove ? (
                  <button type="button" onClick={() => setStep(4)} className={PRIMARY}>
                    Continue to complete
                  </button>
                ) : null}
                {canEditElectricity ? (
                  <button type="button" onClick={() => setStep(2)} className={NEUTRAL}>
                    Back to electricity
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          {step === 4 ? (
            <section className="space-y-8">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-white">Complete checkout</h2>
                <p className="mt-2 text-sm text-apg-silver">
                  Review everything one last time, then finish the move-out.
                </p>
              </div>

              <ul className="space-y-4 rounded-3xl bg-[#1A1F27]/80 p-8 ring-1 ring-white/[0.06]">
                <CheckItem done label="Electricity calculated" />
                <CheckItem done label="Refund amount finalized" />
                <CheckItem done label="Bed will be released" />
                <CheckItem done label="Resident will be notified" />
              </ul>

              {canApprove ? (
                <form action={approveAction} className="space-y-4">
                  <input type="hidden" name="settlementId" value={detail.id} />
                  <input
                    type="hidden"
                    name="noticeDeductionInr"
                    value={(detail.noticeDeductionPaise / 100).toFixed(2)}
                  />
                  <input
                    type="hidden"
                    name="skipElectricityShare"
                    value={preview.electricityDeductFromDeposit ? 'no' : 'yes'}
                  />
                  {preview.electricityDeductFromDeposit ? (
                    <input
                      type="hidden"
                      name="electricityShareInr"
                      value={(preview.electricityDeductionPaise / 100).toFixed(2)}
                    />
                  ) : null}
                  <input
                    type="hidden"
                    name="damageChargeInr"
                    value={(detail.damageChargePaise / 100).toFixed(2)}
                  />
                  <input
                    type="hidden"
                    name="cleaningChargeInr"
                    value={(detail.cleaningChargePaise / 100).toFixed(2)}
                  />
                  <input
                    type="hidden"
                    name="customChargeInr"
                    value={(detail.customChargePaise / 100).toFixed(2)}
                  />
                  <button
                    type="submit"
                    disabled={approvePending || !readiness.ready}
                    className={PRIMARY}
                  >
                    {approvePending ? 'Completing…' : 'Approve & complete checkout'}
                  </button>
                  {!readiness.ready && !approvePending ? (
                    <p className="text-sm text-amber-200">
                      Complete earlier steps first: {readiness.blockingReasons.join(' · ')}
                    </p>
                  ) : null}
                  {approveState.status === 'error' ? (
                    <p className="text-sm text-rose-300">{approveState.message}</p>
                  ) : null}
                  {approveState.status === 'ok' ? (
                    <p className="text-sm text-emerald-300">{approveState.message}</p>
                  ) : null}
                </form>
              ) : null}

              {canMarkPaid ? (
                <form action={refundAction} className="space-y-4">
                  <input type="hidden" name="settlementId" value={detail.id} />
                  <label className="block text-sm">
                    <span className="text-apg-silver">UPI reference after you sent the refund</span>
                    <input
                      name="refundReference"
                      required
                      placeholder="e.g. 123456789012"
                      className="apg-admin-field mt-2 w-full rounded-2xl border border-white/10 bg-[#12161C] px-4 py-3.5 text-white"
                    />
                  </label>
                  <button type="submit" disabled={refundPending} className={PRIMARY}>
                    {refundPending ? 'Completing…' : 'Approve & complete checkout'}
                  </button>
                  {refundState.status === 'error' ? (
                    <p className="text-sm text-rose-300">{refundState.message}</p>
                  ) : null}
                  {refundState.status === 'ok' ? (
                    <p className="text-sm text-emerald-300">{refundState.message}</p>
                  ) : null}
                </form>
              ) : null}

              {canReject ? (
                <form action={rejectAction} className="space-y-4 border-t border-white/[0.06] pt-8">
                  <input type="hidden" name="settlementId" value={detail.id} />
                  <p className="text-sm font-medium text-white">Reject request</p>
                  <p className="text-xs text-apg-silver">
                    Use if photos or UPI details are wrong — the resident can fix and resubmit.
                  </p>
                  <textarea
                    name="rejectionReason"
                    required
                    rows={3}
                    placeholder="Tell the resident what to fix…"
                    className="apg-admin-field w-full rounded-2xl border border-white/10 bg-[#12161C] px-4 py-3 text-sm text-white"
                  />
                  <button type="submit" disabled={rejectPending} className={REJECT}>
                    {rejectPending ? 'Rejecting…' : 'Reject request'}
                  </button>
                  {rejectState.status === 'error' ? (
                    <p className="text-xs text-rose-300">{rejectState.message}</p>
                  ) : null}
                </form>
              ) : null}

              {!canApprove && !canMarkPaid && !canReject ? (
                <p className="text-sm text-apg-silver">This checkout is finished.</p>
              ) : null}

              <Link
                href="/admin/operations/residents"
                className="inline-block text-sm text-apg-silver hover:text-white"
              >
                ← Back to today&apos;s work
              </Link>
            </section>
          ) : null}
        </div>

        {showStickySummary ? (
          <div className="mt-10 hidden w-full max-w-sm shrink-0 lg:sticky lg:top-8 lg:mt-0 lg:block">
            <CheckoutRefundSummaryRail
              detail={detail}
              overrides={
                electricityOverride != null
                  ? { electricityDeductionPaise: electricityOverride }
                  : undefined
              }
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function InfoCell({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wider text-apg-silver">{label}</dt>
      <dd className="mt-1 text-lg font-medium text-white">{value}</dd>
    </div>
  );
}

function CheckItem({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-3 text-base text-white">
      <span
        className={
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ' +
          (done ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/10 text-apg-silver')
        }
      >
        {done ? '✓' : '·'}
      </span>
      {label}
    </li>
  );
}

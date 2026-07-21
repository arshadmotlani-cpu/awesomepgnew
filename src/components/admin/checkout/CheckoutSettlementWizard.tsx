'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import {
  CheckoutSettlementElectricitySection,
  type ElectricityLivePreview,
} from '@/src/components/admin/CheckoutSettlementElectricitySection';
import {
  CheckoutElectricityDraftProvider,
  useCheckoutElectricityDraft,
} from '@/src/components/admin/checkout/CheckoutElectricityDraftContext';
import { FixedStayCheckoutBanner } from '@/src/components/admin/checkout/FixedStayCheckoutBanner';
import { CheckoutCompleteStep } from '@/src/components/admin/checkout/CheckoutCompleteStep';
import { CheckoutJourneyTimeline } from '@/src/components/admin/checkout/CheckoutJourneyTimeline';
import { CheckoutRefundSummaryRail } from '@/src/components/admin/checkout/CheckoutRefundSummaryRail';
import { CheckoutSettlementEvidenceLarge } from '@/src/components/admin/checkout/CheckoutSettlementEvidenceLarge';
import { buildCheckoutJourneyTimeline, wizardStepFromDetail } from '@/src/lib/checkout/checkoutJourneyTimeline';
import { hasCheckoutElectricityEvidence } from '@/src/lib/checkout/checkoutElectricityEvidence';
import { assessCheckoutSettlementReadiness } from '@/src/lib/checkout/checkoutSettlementReadiness';
import { formatDateTime } from '@/src/lib/format';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

const PRIMARY =
  'inline-flex min-h-[52px] items-center justify-center rounded-2xl bg-[#FF5A1F] px-8 py-3.5 text-base font-semibold text-white shadow-[0_12px_40px_rgba(255,90,31,0.22)] transition hover:brightness-110 disabled:opacity-50';

const NEUTRAL =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white hover:bg-white/[0.08]';

type WizardStep = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<WizardStep, string> = {
  1: 'Verify submission',
  2: 'Electricity',
  3: 'Refund summary',
  4: 'Pay & complete',
};

function submissionTime(detail: CheckoutSettlementDetail): string {
  if (detail.status === 'awaiting_resident_details') return 'Not submitted yet';
  return formatDateTime(detail.updatedAt);
}

export function CheckoutSettlementWizard({ detail }: { detail: CheckoutSettlementDetail }) {
  return (
    <CheckoutElectricityDraftProvider>
      <CheckoutSettlementWizardInner detail={detail} />
    </CheckoutElectricityDraftProvider>
  );
}

function CheckoutSettlementWizardInner({ detail }: { detail: CheckoutSettlementDetail }) {
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
  const isFinished =
    detail.status === 'completed' || detail.status === 'refund_paid' || (detail.amountsLocked && zeroRefund);

  const [step, setStep] = useState<WizardStep>(() => wizardStepFromDetail(detail));
  const { livePreview: liveElectricity, setLivePreview: setLiveElectricity } =
    useCheckoutElectricityDraft();
  const handleLivePreviewChange = useCallback(
    (preview: ElectricityLivePreview | null) => {
      setLiveElectricity(preview);
    },
    [setLiveElectricity],
  );

  const steps = useMemo(() => {
    if (waitingResident) return [1] as WizardStep[];
    return [1, 2, 3, 4] as WizardStep[];
  }, [waitingResident]);

  const showStickySummary = !waitingResident && step >= 2 && !isFinished;
  const electricityOverride = liveElectricity?.electricityDeductionPaise;

  return (
    <div className="pb-20">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/admin/operations?filter=checkout"
          className="text-sm font-medium text-[#FF5A1F] hover:underline"
        >
          ← Today&apos;s work
        </Link>
        <p className="text-sm text-apg-silver">
          {detail.customerName} · {detail.pgName} · Room {detail.roomNumber}
        </p>
      </div>

      <FixedStayCheckoutBanner durationMode={detail.durationMode} />

      <div className="mb-10 space-y-6">
        <CheckoutJourneyTimeline detail={detail} />
        {!waitingResident ? (
          <nav aria-label="Checkout steps" className="overflow-x-auto">
            <ol className="flex min-w-max items-center gap-2">
              {steps.map((s, index) => {
                const active = step === s;
                const done = step > s || (isFinished && s < 4);
                return (
                  <li key={s} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => !isFinished && setStep(s)}
                      disabled={isFinished && s !== 4}
                      className={
                        'flex items-center gap-3 rounded-2xl px-4 py-2.5 text-left transition disabled:opacity-60 ' +
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
      </div>

      <div className="lg:flex lg:items-start lg:gap-10">
        <div className="min-w-0 flex-1 space-y-10">
          {step === 1 ? (
            <section className="space-y-8">
              <header>
                <h2 className="text-2xl font-semibold tracking-tight text-white">Verify submission</h2>
                <p className="mt-2 text-sm text-apg-silver">
                  Confirm the meter photo and refund details before calculating electricity.
                </p>
              </header>

              <div className="rounded-3xl bg-[#1A1F27]/80 p-8 ring-1 ring-white/[0.06]">
                <dl className="grid gap-5 sm:grid-cols-2">
                  <InfoCell label="Resident" value={detail.customerName} />
                  <InfoCell label="PG" value={detail.pgName} />
                  <InfoCell label="Room" value={detail.roomNumber} />
                  <InfoCell label="Bed" value={detail.bedCode} />
                  <InfoCell label="Submitted" value={submissionTime(detail)} className="sm:col-span-2" />
                </dl>
              </div>

              <div className="grid gap-6">
                <CheckoutSettlementEvidenceLarge
                  title="Meter photo"
                  evidence={detail.meterPhotoEvidence}
                  emptyLabel={
                    detail.electricityUseAverage
                      ? 'Resident chose average billing'
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
                  <p className="mt-2 font-mono text-2xl text-white">{detail.payoutUpiId}</p>
                </div>
              ) : null}

              {waitingResident ? (
                <p className="text-sm text-sky-200">Waiting for the resident to upload their details.</p>
              ) : (
                <button type="button" onClick={() => setStep(2)} className={PRIMARY}>
                  Continue to electricity
                </button>
              )}
            </section>
          ) : null}

          {step === 2 ? (
            <section className="space-y-8">
              <header>
                <h2 className="text-2xl font-semibold tracking-tight text-white">Electricity</h2>
                <p className="mt-2 text-sm text-apg-silver">
                  Amounts save automatically as you type.
                </p>
              </header>

              {canEditElectricity ? (
                <div className="rounded-3xl bg-[#1A1F27]/80 p-8 ring-1 ring-white/[0.06]">
                  <CheckoutSettlementElectricitySection
                    detail={detail}
                    editable
                    operatorMode
                    autoSave
                    onLivePreviewChange={handleLivePreviewChange}
                  />
                </div>
              ) : (
                <p className="text-sm text-apg-silver">Electricity is already calculated.</p>
              )}

              <button type="button" onClick={() => setStep(3)} className={PRIMARY}>
                Continue to refund summary
              </button>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="space-y-8">
              <header>
                <h2 className="text-2xl font-semibold tracking-tight text-white">Refund summary</h2>
                <p className="mt-2 text-sm text-apg-silver">
                  {zeroRefund
                    ? 'Deposit covers all charges — no refund to send.'
                    : 'Review the final amount. You will pay the resident in the next step.'}
                </p>
              </header>

              <div className="lg:hidden">
                <CheckoutRefundSummaryRail
                  detail={detail}
                  overrides={
                    electricityOverride != null
                      ? { electricityDeductionPaise: electricityOverride }
                      : undefined
                  }
                />
              </div>

              {(canApprove || canMarkPaid || isFinished) && !isFinished ? (
                <button type="button" onClick={() => setStep(4)} className={PRIMARY}>
                  {zeroRefund ? 'Continue to complete' : 'Continue to pay resident'}
                </button>
              ) : null}

              {canEditElectricity && !isFinished ? (
                <button type="button" onClick={() => setStep(2)} className={NEUTRAL}>
                  Back to electricity
                </button>
              ) : null}
            </section>
          ) : null}

          {step === 4 ? (
            <section className="space-y-8">
              <header>
                <h2 className="text-2xl font-semibold tracking-tight text-white">
                  {isFinished ? 'Checkout complete' : 'Pay & complete'}
                </h2>
                <p className="mt-2 text-sm text-apg-silver">
                  {isFinished
                    ? 'Refund receipt for your records.'
                    : zeroRefund
                      ? 'Confirm and release the bed.'
                      : 'Send the refund, confirm payment, then finish checkout.'}
                </p>
              </header>

              <CheckoutCompleteStep
                detail={detail}
                canApprove={canApprove}
                canMarkPaid={canMarkPaid}
                canReject={canReject}
                readinessReady={readiness.ready}
                blockingReasons={readiness.blockingReasons}
                zeroRefund={zeroRefund}
              />
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

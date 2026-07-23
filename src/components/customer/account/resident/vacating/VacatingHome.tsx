'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApgCard, StatusChip, StatusTimeline } from '@/src/components/customer/design-system';
import { DepositRefundRequestForm } from '@/src/components/customer/account/DepositRefundRequestForm';
import { NoticeSettlementPanel } from '@/src/components/shared/NoticeDeductionBreakdown';
import { CancelVacatingForm } from '@/src/components/customer/CancelVacatingForm';
import { MoveOutRefundSuccess } from '@/src/components/customer/account/resident/vacating/MoveOutRefundSuccess';
import { ChangeLeavingDateForm } from '@/src/components/customer/account/resident/vacating/ChangeLeavingDateForm';
import { ResidentEstimatedSettlementBreakdown } from '@/src/components/customer/account/resident/vacating/ResidentEstimatedSettlementBreakdown';
import { ResidentSettlementBreakdown } from '@/src/components/customer/account/resident/vacating/ResidentSettlementBreakdown';
import { cancelApprovedVacatingAction } from '@/app/(customer)/account/resident/vacating-date-change-actions';
import {
  buildVacatingSettlementLines,
  canRequestMoveOutRefund,
  vacatingNextStep,
  vacatingStageIndex,
  VACATING_JOURNEY_STAGES,
} from '@/src/lib/residents/vacatingJourney';
import {
  buildVacatingTimelineStages,
  currentStageLabel,
  ESTIMATED_REFUND_HELPER,
  estimateRefundPaise,
  expectedCompletionLabel,
  isBeforeVacatingDate,
  refundUnlockCountdown,
  residentMoveOutChipLabel,
  residentSettlementStatusLabel,
} from '@/src/lib/residents/vacatingPresentation';
import { isFixedStayDurationMode } from '@/src/lib/checkout/checkoutWorkflow';
import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import type { VacatingForBookingRow } from '@/src/db/queries/customer';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { tryDiffDays } from '@/src/lib/dates';
import { breakdownFromStoredNoticeSnapshot } from '@/src/lib/vacating/noticeDeductionPresentation';
import { noticeShortfallDays } from '@/src/services/billing';
import { primaryBtn } from '@/src/lib/design-system/tokens';
import type { EstimatedSettlementPreview } from '@/src/lib/vacating/estimatedSettlementPreview';

type Props = {
  bookingId: string;
  bookingCode: string;
  roomLabel: string;
  customerId: string;
  vacating: VacatingForBookingRow | null;
  checkoutStatus: string | null;
  checkoutSettlement?: {
    status: string;
    rejectionReason?: string | null;
    payoutUpiId?: string | null;
    refundPaidAt?: Date | string | null;
  } | null;
  settlementWaterfall?: CheckoutSettlementWaterfall | null;
  totalRefundPaise?: number | null;
  payoutUpiId?: string | null;
  refundPaidAt?: Date | string | null;
  checkoutSettlementSuppressed?: boolean;
  depositHeldPaise: number;
  durationMode?: string;
  expectedCheckoutDate?: string | null;
  bookingStatus?: string;
  monthlyRentPaise?: number;
  estimatedSettlement?: EstimatedSettlementPreview | null;
  pendingDateChangeRequestId?: string | null;
};

function safeDateString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function VacatingHome({
  bookingId,
  bookingCode,
  roomLabel,
  customerId,
  vacating,
  checkoutStatus,
  checkoutSettlement = null,
  settlementWaterfall = null,
  totalRefundPaise = null,
  payoutUpiId = null,
  refundPaidAt = null,
  checkoutSettlementSuppressed = false,
  depositHeldPaise,
  durationMode = 'monthly',
  expectedCheckoutDate = null,
  estimatedSettlement = null,
  pendingDateChangeRequestId = null,
}: Props) {
  const router = useRouter();
  const fixedStay = isFixedStayDurationMode(durationMode);

  const vacatingDate = safeDateString(vacating?.vacatingDate);
  const resolvedPayoutUpiId = payoutUpiId ?? checkoutSettlement?.payoutUpiId ?? null;
  const resolvedRefundPaidAt = refundPaidAt ?? checkoutSettlement?.refundPaidAt ?? null;

  const refundGate = canRequestMoveOutRefund({
    vacatingStatus: vacating?.status ?? null,
    vacatingDate,
    checkoutStatus,
    checkoutSettlementSuppressed,
  });

  const activeIndex = vacatingStageIndex({
    vacatingStatus: vacating?.status ?? null,
    checkoutStatus,
    vacatingDate,
    durationMode,
    checkoutSettlementSuppressed,
    finalRefundPaise: totalRefundPaise,
  });

  const timelineStages = buildVacatingTimelineStages({
    vacatingStatus: vacating?.status ?? null,
    checkoutStatus,
    vacatingDate,
    durationMode,
    checkoutSettlementSuppressed,
    finalRefundPaise: totalRefundPaise,
    waterfall: settlementWaterfall,
  });

  const settlementStatusLabel = residentSettlementStatusLabel({
    checkoutStatus,
    waterfall: settlementWaterfall,
  });

  const nextStep = vacatingNextStep({
    vacating,
    checkoutStatus,
    durationMode,
    expectedCheckoutDate,
    estimatedFinalRefundPaise: estimateRefundPaise(depositHeldPaise, vacating),
    checkoutSettlementSuppressed,
  });

  const settlementLines = buildVacatingSettlementLines(vacating);
  const v2RefundEstimate = estimatedSettlement?.estimatedRefundPaise ?? null;
  const refundEstimate =
    v2RefundEstimate ?? estimateRefundPaise(depositHeldPaise, vacating);
  const completionLabel = expectedCompletionLabel({ vacating, checkoutStatus });
  const stageLabel = currentStageLabel(
    vacating?.status ?? null,
    checkoutStatus,
    vacatingDate,
    durationMode,
  );
  const isRejected = vacating?.status === 'rejected';
  const isActiveVacating =
    vacating != null && ['pending', 'approved'].includes(vacating.status);

  const isMoveOutComplete =
    checkoutStatus === 'refund_paid' ||
    checkoutStatus === 'completed' ||
    vacating?.status === 'completed';

  const showRefundForm =
    refundGate.allowed &&
    (checkoutStatus === 'awaiting_resident_details' || !checkoutStatus) &&
    !checkoutSettlementSuppressed &&
    !isMoveOutComplete;

  const showBreakdownPanel =
    vacating != null &&
    (vacating.status === 'approved' ||
      vacating.status === 'completed' ||
      activeIndex >= 2);

  const showV2Estimate =
    estimatedSettlement != null &&
    !settlementWaterfall &&
    activeIndex < 4 &&
    !isMoveOutComplete;

  const showEstimateStats =
    (refundEstimate != null || completionLabel) &&
    !isMoveOutComplete &&
    activeIndex <= 3 &&
    !showV2Estimate;

  const beforeVacateDate =
    vacating?.status === 'approved' &&
    vacatingDate != null &&
    isBeforeVacatingDate(vacatingDate);

  const showChangeLeavingDate =
    vacating?.status === 'approved' &&
    !checkoutSettlementSuppressed &&
    !checkoutStatus &&
    !isMoveOutComplete;

  const showRefundLockedCard =
    !showRefundForm &&
    !isMoveOutComplete &&
    vacating?.status === 'approved' &&
    activeIndex === 2 &&
    beforeVacateDate;

  const unlockCountdown =
    showRefundLockedCard && vacatingDate
      ? refundUnlockCountdown({ vacatingDate })
      : null;

  const heroDetail =
    activeIndex >= 3 && settlementStatusLabel
      ? settlementStatusLabel
      : showRefundLockedCard && unlockCountdown
        ? unlockCountdown.headline
        : nextStep.detail;

  const noticeGiven = safeDateString(vacating?.noticeGivenDate);
  const noticeBreakdown =
    vacating != null && noticeGiven && vacatingDate
      ? breakdownFromStoredNoticeSnapshot({
          noticeGivenDate: noticeGiven,
          vacatingDate,
          noticeGivenDays: Math.max(0, tryDiffDays(noticeGiven, vacatingDate) ?? 0),
          noticeShortfallDays: noticeShortfallDays({
            noticeGivenDate: noticeGiven,
            vacatingDate,
          }),
          noticeRentCoveredDays: vacating.noticeRentCoveredDays,
          noticeChargeableDays: vacating.noticeChargeableDays,
          deductionPaise: vacating.deductionPaise,
        })
      : null;

  const successRefundPaise =
    totalRefundPaise ??
    settlementWaterfall?.refund.totalPaise ??
    refundEstimate ??
    0;

  if (fixedStay) {
    return (
      <div className="space-y-4 pb-2">
        {isMoveOutComplete ? (
          <MoveOutRefundSuccess
            refundPaise={successRefundPaise}
            refundPaidAt={resolvedRefundPaidAt}
            payoutUpiId={resolvedPayoutUpiId}
            bookingId={bookingId}
          />
        ) : (
          <ApgCard tier="account" className="overflow-hidden p-0">
            <div className="border-b border-zinc-200 bg-gradient-to-br from-zinc-50 via-white to-white px-5 py-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-apg-orange">
                Fixed-stay checkout
              </p>
              <h2 className="mt-2 text-xl font-bold text-zinc-900">{nextStep.headline}</h2>
              <p className="mt-1 text-sm text-zinc-600">{heroDetail}</p>
            </div>
          </ApgCard>
        )}
        {showBreakdownPanel ? (
          <ResidentSettlementBreakdown waterfall={settlementWaterfall} />
        ) : null}
        {showRefundForm ? (
          <DepositRefundRequestForm
            bookingId={bookingId}
            customerId={customerId}
            refundableBalancePaise={depositHeldPaise}
            estimatedDeductionPaise={vacating?.deductionPaise ?? 0}
            onSubmitted={() => router.refresh()}
            compact
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-2">
      {isMoveOutComplete ? (
        <MoveOutRefundSuccess
          refundPaise={successRefundPaise}
          refundPaidAt={resolvedRefundPaidAt}
          payoutUpiId={resolvedPayoutUpiId}
          bookingId={bookingId}
        />
      ) : (
        <ApgCard tier="account" className="overflow-hidden p-0">
          <div className="border-b border-zinc-200 bg-gradient-to-br from-zinc-50 via-white to-white px-5 py-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-apg-orange">
                  {stageLabel}
                </p>
                <h2 className="mt-2 text-xl font-bold text-zinc-900">{nextStep.headline}</h2>
                <p className="mt-1 text-sm text-zinc-600">{heroDetail}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  {roomLabel} · Booking {bookingCode}
                </p>
              </div>
              {vacating ? (
                <StatusChip
                  status={residentMoveOutChipLabel({
                    vacatingStatus: vacating.status,
                    checkoutStatus,
                  })}
                />
              ) : null}
            </div>
          </div>
          {showEstimateStats ? (
            <dl className="grid grid-cols-1 gap-px bg-zinc-100 sm:grid-cols-2">
              {refundEstimate != null ? (
                <div className="bg-white px-4 py-3 sm:col-span-2">
                  <dt className="text-[10px] font-medium uppercase text-zinc-500">
                    Estimated Refund ≈
                  </dt>
                  <dd className="mt-1 text-lg font-bold tabular-nums text-emerald-700">
                    {paiseToInr(refundEstimate)}
                  </dd>
                  <p className="mt-1 text-xs text-zinc-500">{ESTIMATED_REFUND_HELPER}</p>
                </div>
              ) : null}
              {completionLabel ? (
                <div className={`bg-white px-4 py-3 ${refundEstimate == null ? 'sm:col-span-2' : ''}`}>
                  <dt className="text-[10px] font-medium uppercase text-zinc-500">Expected</dt>
                  <dd className="mt-1 text-sm font-medium text-zinc-900">{completionLabel}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </ApgCard>
      )}

      {!vacating ? (
        <Link href={`/account/resident/request-vacating/${bookingId}`} className={primaryBtn}>
          Request move-out
        </Link>
      ) : isRejected ? (
        <>
          <ApgCard tier="account" className="border-rose-200 bg-rose-50/60 p-5">
            <p className="text-sm font-semibold text-rose-900">Move-out request not approved.</p>
            {vacating.notes?.trim() ? (
              <p className="mt-2 text-sm text-rose-800">
                Reason: <span className="font-medium">{vacating.notes.trim()}</span>
              </p>
            ) : null}
          </ApgCard>
          <Link href={`/account/resident/request-vacating/${bookingId}`} className={primaryBtn}>
            Submit new move-out request
          </Link>
        </>
      ) : (
        <>
          <ApgCard tier="account" className="p-5">
            <h3 className="text-sm font-semibold text-zinc-900">Your move-out timeline</h3>
            <div className="mt-4">
              <StatusTimeline
                stages={timelineStages}
                activeIndex={activeIndex}
                orientation="vertical"
              />
            </div>
          </ApgCard>

          {showV2Estimate && estimatedSettlement ? (
            <ApgCard tier="account" className="p-5">
              <h3 className="text-sm font-semibold text-zinc-900">Estimated settlement</h3>
              <div className="mt-3">
                <ResidentEstimatedSettlementBreakdown preview={estimatedSettlement} />
              </div>
            </ApgCard>
          ) : null}

          {showChangeLeavingDate && vacatingDate ? (
            <ChangeLeavingDateForm
              bookingId={bookingId}
              currentVacatingDate={vacatingDate}
              pendingRequestId={pendingDateChangeRequestId}
              onSubmitted={() => router.refresh()}
            />
          ) : null}

          {showBreakdownPanel && settlementWaterfall ? (
            <ResidentSettlementBreakdown waterfall={settlementWaterfall} />
          ) : null}

          {vacating && noticeBreakdown && vacating.deductionPaise > 0 && activeIndex < 4 && !showV2Estimate ? (
            <ApgCard tier="account" className="p-5">
              <h3 className="text-sm font-semibold text-zinc-900">Notice period estimate</h3>
              <div className="mt-3">
                <NoticeSettlementPanel settlement={noticeBreakdown} variant="resident" compact />
              </div>
            </ApgCard>
          ) : null}

          {checkoutSettlement?.rejectionReason ? (
            <ApgCard tier="account" className="border-amber-200 bg-amber-50/80 p-5">
              <p className="text-sm font-semibold text-amber-900">Please resubmit your refund request</p>
              <p className="mt-1 text-sm text-amber-800">{checkoutSettlement.rejectionReason}</p>
            </ApgCard>
          ) : null}

          {showRefundLockedCard && unlockCountdown && vacatingDate ? (
            <ApgCard tier="account" className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-zinc-900">Refund request</h3>
                <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800 ring-1 ring-indigo-200">
                  {unlockCountdown.badgeText}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-zinc-900">{unlockCountdown.headline}</p>
              <p className="mt-1 text-sm text-zinc-600">
                Approved move-out date · {formatDate(vacatingDate)}
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                After this date, submit your UPI QR and final AC meter photo below.
              </p>
            </ApgCard>
          ) : null}

          {showRefundForm ? (
            <DepositRefundRequestForm
              bookingId={bookingId}
              customerId={customerId}
              refundableBalancePaise={depositHeldPaise}
              estimatedDeductionPaise={vacating.deductionPaise ?? 0}
              onSubmitted={() => router.refresh()}
              compact
            />
          ) : !showRefundLockedCard &&
            !refundGate.allowed &&
            vacating.status === 'approved' &&
            activeIndex === 2 ? (
            <ApgCard tier="account" className="p-5">
              <h3 className="text-sm font-semibold text-zinc-900">Refund request</h3>
              <p className="mt-1 text-sm text-zinc-600">{refundGate.reason}</p>
            </ApgCard>
          ) : null}

          {vacating && (
            <ApgCard tier="account" className="p-5">
              <h3 className="text-sm font-semibold text-zinc-900">Move-out details</h3>
              <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                {noticeGiven ? (
                  <div>
                    <dt className="text-zinc-600">Request submitted</dt>
                    <dd className="font-medium text-zinc-900">{formatDate(noticeGiven)}</dd>
                  </div>
                ) : null}
                {vacatingDate ? (
                  <div>
                    <dt className="text-zinc-600">Move-out date</dt>
                    <dd className="font-medium text-zinc-900">{formatDate(vacatingDate)}</dd>
                  </div>
                ) : null}
              </dl>
            </ApgCard>
          )}

          {settlementLines.length > 0 ? (
            <ApgCard tier="account" className="p-5">
              <h3 className="text-sm font-semibold text-zinc-900">Final settlement</h3>
              <ul className="mt-3 space-y-2">
                {settlementLines.map((line) => (
                  <li key={line.label} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-700">{line.label}</span>
                    <span className="tabular-nums font-semibold text-zinc-900">
                      {paiseToInr(line.amountPaise)}
                    </span>
                  </li>
                ))}
              </ul>
            </ApgCard>
          ) : null}

          {isActiveVacating && vacating.status === 'pending' ? (
            <CancelVacatingForm requestId={vacating.id} bookingId={bookingId} />
          ) : null}

          {isActiveVacating && vacating.status === 'approved' && !checkoutStatus ? (
            <ApgCard tier="account" className="p-5">
              <p className="text-sm text-zinc-600">
                Need a date that does not satisfy the 14-day notice rule? Cancel this approved move-out
                and submit a new request.
              </p>
              <button
                type="button"
                className="mt-3 text-sm font-medium text-rose-700 underline"
                onClick={() =>
                  void cancelApprovedVacatingAction(vacating.id).then((res) => {
                    if (res.ok) router.refresh();
                  })
                }
              >
                Cancel approved move-out
              </button>
            </ApgCard>
          ) : null}
        </>
      )}

      {isMoveOutComplete ? (
        <>
          <ApgCard tier="account" className="p-5">
            <h3 className="text-sm font-semibold text-zinc-900">Your move-out timeline</h3>
            <div className="mt-4">
              <StatusTimeline
                stages={timelineStages}
                activeIndex={activeIndex}
                orientation="vertical"
              />
            </div>
          </ApgCard>
          {showBreakdownPanel ? (
            <ResidentSettlementBreakdown waterfall={settlementWaterfall} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

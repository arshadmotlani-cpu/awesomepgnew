'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApgCard } from '@/src/components/customer/design-system';
import { DepositRefundRequestForm } from '@/src/components/customer/account/DepositRefundRequestForm';
import { MoveOutRefundSuccess } from '@/src/components/customer/account/resident/vacating/MoveOutRefundSuccess';
import { ChangeLeavingDateForm } from '@/src/components/customer/account/resident/vacating/ChangeLeavingDateForm';
import { ResidentCancelMoveOutCard } from '@/src/components/customer/account/resident/vacating/ResidentCancelMoveOutCard';
import { ResidentMoveOutActionsCard } from '@/src/components/customer/account/resident/vacating/ResidentMoveOutActionsCard';
import { ResidentMoveOutRefundCard } from '@/src/components/customer/account/resident/vacating/ResidentMoveOutRefundCard';
import { ResidentMoveOutSummaryCard } from '@/src/components/customer/account/resident/vacating/ResidentMoveOutSummaryCard';
import type { ResidentSettlementStatementContext } from '@/src/components/customer/account/resident/vacating/ResidentEstimatedSettlementBreakdown';
import { isFixedStayDurationMode } from '@/src/lib/checkout/checkoutWorkflow';
import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import type { VacatingForBookingRow } from '@/src/db/queries/customer';
import { formatDate } from '@/src/lib/format';
import { primaryBtn } from '@/src/lib/design-system/tokens';
import type { EstimatedSettlementPreview } from '@/src/lib/vacating/estimatedSettlementPreview';
import type { ResidentExitBrainSnapshot } from '@/src/lib/exit/exitBrainTypes';
import {
  isMoveOutLifecycleComplete,
  resolveExitLifecycleFromSnapshot,
} from '@/src/lib/exit/exitBrainLifecycleUi';
import { buildResidentMoveOutRefundSummary } from '@/src/lib/residents/residentMoveOutRefundSummary';
import { buildResidentMoveOutResidentActions } from '@/src/lib/residents/residentMoveOutResidentActions';
import { estimateRefundPaise } from '@/src/lib/residents/vacatingPresentation';

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
  pendingDateChangePreview?: import('@/src/services/vacatingDateChange').VacatingDateChangePreview | null;
  settlementContext?: ResidentSettlementStatementContext | null;
  settlementDocument?: import('@/src/lib/vacating/settlementStatementModel').SettlementStatementDocumentModel | null;
  settlementNoticeDisplay?: import('@/src/lib/vacating/noticeDeductionPresentation').NoticeSettlementDisplay | null;
  exitBrainSnapshot?: ResidentExitBrainSnapshot | null;
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
  estimatedSettlement = null,
  pendingDateChangeRequestId = null,
  pendingDateChangePreview = null,
  exitBrainSnapshot = null,
}: Props) {
  const router = useRouter();
  const fixedStay = isFixedStayDurationMode(durationMode);
  const lifecycle = resolveExitLifecycleFromSnapshot(exitBrainSnapshot);

  const vacatingDate = safeDateString(vacating?.vacatingDate);
  const noticeGiven = safeDateString(vacating?.noticeGivenDate);
  const resolvedPayoutUpiId = payoutUpiId ?? checkoutSettlement?.payoutUpiId ?? null;
  const resolvedRefundPaidAt = refundPaidAt ?? checkoutSettlement?.refundPaidAt ?? null;

  const resolvedWaterfall = settlementWaterfall ?? estimatedSettlement?.waterfall ?? null;
  const settlementMode: EstimatedSettlementPreview['mode'] =
    estimatedSettlement?.mode ?? (settlementWaterfall != null ? 'final' : 'estimate');

  const refundGate = {
    allowed: lifecycle.capabilities.canRequestRefund.allowed,
    reason: lifecycle.capabilities.canRequestRefund.reason,
  };

  const isRejected = vacating?.status === 'rejected';
  const isMoveOutComplete = isMoveOutLifecycleComplete(lifecycle);

  const showRefundForm =
    refundGate.allowed &&
    (checkoutStatus === 'awaiting_resident_details' || !checkoutStatus) &&
    !checkoutSettlementSuppressed &&
    !isMoveOutComplete;

  const showChangeLeavingDate =
    lifecycle.capabilities.canEditVacating.allowed &&
    !checkoutSettlementSuppressed &&
    !checkoutStatus &&
    !isMoveOutComplete &&
    !fixedStay;

  const showCancelMoveOut =
    vacating &&
    (vacating.status === 'pending' || vacating.status === 'approved') &&
    !checkoutStatus &&
    !checkoutSettlementSuppressed &&
    !isMoveOutComplete &&
    !fixedStay;

  const changeLeavingDateBlockedReason =
    !showChangeLeavingDate &&
    vacating?.status === 'approved' &&
    vacatingDate &&
    !isRejected &&
    !isMoveOutComplete &&
    !fixedStay
      ? checkoutSettlementSuppressed
        ? 'Move-out settlement is not available for this booking. Contact the office if you need to change your date.'
        : checkoutStatus
          ? 'Your move-out is already being processed. Contact the office if you need a different final stay date.'
          : lifecycle.capabilities.canEditVacating.reason ?? 'Your final stay date cannot be changed right now.'
      : null;

  const successRefundPaise =
    totalRefundPaise ??
    settlementWaterfall?.refund.totalPaise ??
    estimatedSettlement?.estimatedRefundPaise ??
    estimateRefundPaise(depositHeldPaise, vacating) ??
    0;

  const refundSummary =
    resolvedWaterfall != null ? buildResidentMoveOutRefundSummary(resolvedWaterfall) : null;

  const residentActions = buildResidentMoveOutResidentActions({
    vacatingStatus: vacating?.status ?? null,
    pendingDateChangeRequestId,
    checkoutStatus,
    checklist: exitBrainSnapshot?.checklist,
    hasPayoutDetails: Boolean(resolvedPayoutUpiId),
  });

  const footerMessage =
    'Once your move-out is completed, we will calculate the final settlement and process your refundable amount after any applicable deductions.';

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
          <ApgCard tier="resident" className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-apg-orange">
              Fixed-stay checkout
            </p>
            <h2 className="text-lg font-semibold text-white">Your checkout</h2>
            <p className="text-sm text-apg-silver">
              {roomLabel} · Booking {bookingCode}
            </p>
          </ApgCard>
        )}
        {refundSummary ? (
          <ResidentMoveOutRefundCard
            summary={refundSummary}
            showApproxPrefix={settlementMode !== 'final'}
          />
        ) : null}
        {showRefundForm ? (
          <DepositRefundRequestForm
            bookingId={bookingId}
            customerId={customerId}
            refundableBalancePaise={depositHeldPaise}
            estimatedDeductionPaise={vacating?.deductionPaise ?? 0}
            exitBrainSnapshot={exitBrainSnapshot}
            onSubmitted={() => router.refresh()}
            compact
          />
        ) : null}
        {!isMoveOutComplete ? (
          <p className="text-xs text-apg-silver">{footerMessage}</p>
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
      ) : null}

      {!vacating ? (
        <Link href={`/account/resident/request-vacating/${bookingId}`} className={primaryBtn}>
          Request move-out
        </Link>
      ) : isRejected ? (
        <>
          <ApgCard tier="resident" className="border-rose-500/30 bg-rose-950/20">
            <p className="text-sm font-semibold text-rose-200">Move-out request not approved</p>
            {vacating.notes?.trim() ? (
              <p className="mt-2 text-sm text-rose-100/90">
                {vacating.notes.trim()}
              </p>
            ) : null}
          </ApgCard>
          <Link href={`/account/resident/request-vacating/${bookingId}`} className={primaryBtn}>
            Submit new move-out request
          </Link>
        </>
      ) : !isMoveOutComplete ? (
        <>
          {vacatingDate ? (
            <ResidentMoveOutSummaryCard
              vacatingDate={vacatingDate}
              noticeGivenDate={noticeGiven}
              vacatingStatus={vacating.status}
              roomLabel={roomLabel}
              bookingCode={bookingCode}
            />
          ) : null}

          {showChangeLeavingDate && vacatingDate ? (
            <div id="change-leaving-date">
              <ChangeLeavingDateForm
                bookingId={bookingId}
                currentVacatingDate={vacatingDate}
                pendingRequestId={pendingDateChangeRequestId}
                pendingPreview={pendingDateChangePreview}
                originalNoticeGivenDate={noticeGiven}
                onSubmitted={() => router.refresh()}
              />
            </div>
          ) : changeLeavingDateBlockedReason ? (
            <ApgCard tier="resident">
              <h2 className="text-sm font-semibold text-white">Change final stay date</h2>
              <p className="mt-2 text-sm text-apg-silver">{changeLeavingDateBlockedReason}</p>
              {vacatingDate ? (
                <p className="mt-2 text-xs text-apg-silver">
                  Your approved final stay date is {formatDate(vacatingDate)}.
                </p>
              ) : null}
            </ApgCard>
          ) : null}

          {showCancelMoveOut ? (
            <ResidentCancelMoveOutCard
              requestId={vacating.id}
              vacatingStatus={vacating.status}
            />
          ) : null}

          {checkoutSettlement?.rejectionReason ? (
            <ApgCard tier="resident" className="border-amber-500/30 bg-amber-950/20">
              <p className="text-sm font-semibold text-amber-200">Please resubmit your refund details</p>
              <p className="mt-1 text-sm text-amber-100/90">{checkoutSettlement.rejectionReason}</p>
            </ApgCard>
          ) : null}

          {refundSummary ? (
            <ResidentMoveOutRefundCard
              summary={refundSummary}
              showApproxPrefix={settlementMode !== 'final'}
            />
          ) : null}

          <ResidentMoveOutActionsCard items={residentActions} />

          {showRefundForm ? (
            <DepositRefundRequestForm
              bookingId={bookingId}
              customerId={customerId}
              refundableBalancePaise={depositHeldPaise}
              estimatedDeductionPaise={vacating.deductionPaise ?? 0}
              exitBrainSnapshot={exitBrainSnapshot}
              onSubmitted={() => router.refresh()}
            />
          ) : !refundGate.allowed && vacating.status === 'approved' && !showRefundForm ? (
            <ApgCard tier="resident">
              <p className="text-sm text-apg-silver">{refundGate.reason}</p>
            </ApgCard>
          ) : null}

          <p className="text-xs text-apg-silver">{footerMessage}</p>
        </>
      ) : (
        <>
          {vacatingDate ? (
            <ResidentMoveOutSummaryCard
              vacatingDate={vacatingDate}
              noticeGivenDate={noticeGiven}
              vacatingStatus={vacating.status}
              roomLabel={roomLabel}
              bookingCode={bookingCode}
            />
          ) : null}
          {refundSummary ? (
            <ResidentMoveOutRefundCard summary={refundSummary} showApproxPrefix={false} />
          ) : null}
        </>
      )}
    </div>
  );
}

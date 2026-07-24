import { formatDate } from '@/src/lib/format';
import { todayString, tryDiffDays } from '@/src/lib/dates';
import type { VacatingForBookingRow } from '@/src/db/queries/customer';
import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { VACATING_JOURNEY_STAGES, vacatingStageIndex } from '@/src/lib/residents/vacatingJourney';
import {
  RESIDENT_MOVE_OUT_COMPLETED,
  RESIDENT_WAITING_METER_UPI_ON_VACATE_DATE,
  RESIDENT_WAITING_PG_VERIFICATION,
} from '@/src/lib/moveOut/moveOutWorkflowStages';

/** Single resident status line aligned with admin workflow SSOT. */
export function residentWorkflowStatusLine(input: {
  vacatingStatus: string | null;
  checkoutStatus: string | null;
  vacatingDate?: string | null;
  today?: string;
}): string | null {
  const { vacatingStatus, checkoutStatus } = input;
  if (
    checkoutStatus === 'refund_paid' ||
    checkoutStatus === 'completed' ||
    vacatingStatus === 'completed'
  ) {
    return RESIDENT_MOVE_OUT_COMPLETED;
  }
  if (checkoutStatus === 'awaiting_admin_review') {
    return RESIDENT_WAITING_PG_VERIFICATION;
  }
  if (vacatingStatus === 'approved') {
    if (checkoutStatus === 'awaiting_resident_details' || !checkoutStatus) {
      return RESIDENT_WAITING_METER_UPI_ON_VACATE_DATE;
    }
  }
  return null;
}

export function estimateRefundPaise(
  depositHeldPaise: number,
  vacating: VacatingForBookingRow | null,
): number | null {
  if (vacating?.status === 'completed' && vacating.depositRefundPaise > 0) {
    return vacating.depositRefundPaise;
  }
  if (depositHeldPaise <= 0) return null;
  if (!vacating || !['pending', 'approved'].includes(vacating.status)) return null;
  const deduction = vacating.deductionPaise ?? 0;
  return Math.max(0, depositHeldPaise - deduction);
}

export function expectedCompletionLabel(input: {
  vacating: VacatingForBookingRow | null;
  checkoutStatus: string | null;
}): string | null {
  const { vacating, checkoutStatus } = input;

  if (checkoutStatus === 'refund_paid' || checkoutStatus === 'completed') {
    return 'Move-out complete';
  }
  if (checkoutStatus === 'refund_pending' || checkoutStatus === 'awaiting_admin_review') {
    return 'Refund expected within 3–5 working days after review';
  }
  if (checkoutStatus === 'awaiting_resident_details') {
    return 'Complete after you submit meter photo and UPI details';
  }
  if (vacating?.status === 'pending') {
    return 'Expected after the office approves your vacate date';
  }
  if (vacating?.status === 'approved' && vacating.vacatingDate) {
    return `Settlement starts on ${formatDate(vacating.vacatingDate)}`;
  }
  return null;
}

export function isBeforeVacatingDate(vacatingDate: string | null | undefined, today?: string): boolean {
  const vacDate = vacatingDate?.slice(0, 10);
  if (!vacDate) return false;
  return (today ?? todayString()) < vacDate;
}

/** Stage 3 label — dynamic before/after approved vacate date. */
export function refundRequestStageLabel(input: {
  vacatingDate?: string | null;
  today?: string;
}): string {
  if (isBeforeVacatingDate(input.vacatingDate, input.today)) {
    return 'Waiting for Refund Request';
  }
  return 'Ready to Request Refund';
}

export function refundUnlockCountdown(input: {
  vacatingDate: string;
  today?: string;
}): {
  daysUntil: number;
  headline: string;
  badgeText: string;
} {
  const today = input.today ?? todayString();
  const vacDate = input.vacatingDate.slice(0, 10);
  const rawDays = tryDiffDays(today, vacDate) ?? 0;
  const daysUntil = Math.max(0, rawDays);

  let headline: string;
  if (daysUntil === 0) {
    headline = 'Refund request opens today';
  } else if (daysUntil === 1) {
    headline = 'Refund request opens in 1 day';
  } else {
    headline = `Refund request opens in ${daysUntil} days`;
  }

  const badgeText =
    daysUntil === 0 ? 'Today' : daysUntil === 1 ? '1 day' : `${daysUntil} days`;

  return { daysUntil, headline, badgeText };
}

/** Human-readable settlement progress — never expose internal checkout statuses. */
export function residentSettlementStatusLabel(input: {
  checkoutStatus: string | null;
  waterfall?: CheckoutSettlementWaterfall | null;
}): string | null {
  const { checkoutStatus, waterfall } = input;
  if (!checkoutStatus) return null;

  if (checkoutStatus === 'refund_pending') {
    return 'Refund is being processed';
  }
  if (checkoutStatus === 'awaiting_admin_review') {
    if (!waterfall) return 'Waiting for meter verification';
    if ((waterfall.depositBucket.electricityPaise ?? 0) === 0) {
      return 'Calculating electricity charges';
    }
    return 'Waiting for admin review';
  }
  if (checkoutStatus === 'refund_paid' || checkoutStatus === 'completed') {
    return 'Move-out complete';
  }
  if (checkoutStatus === 'awaiting_resident_details') {
    return null;
  }
  return null;
}

/** Friendly chip label for move-out header — no raw status strings. */
export function residentMoveOutChipLabel(input: {
  vacatingStatus: string | null;
  checkoutStatus: string | null;
}): string {
  if (input.checkoutStatus === 'refund_paid' || input.checkoutStatus === 'completed') {
    return 'Refund sent';
  }
  if (input.checkoutStatus === 'refund_pending') {
    return 'Refund processing';
  }
  if (input.checkoutStatus === 'awaiting_admin_review') {
    return 'Under review';
  }
  if (input.checkoutStatus === 'awaiting_resident_details') {
    return 'Action needed';
  }
  if (input.vacatingStatus === 'pending') return 'Pending approval';
  if (input.vacatingStatus === 'approved') return 'Vacate approved';
  if (input.vacatingStatus === 'completed') return 'Move-out complete';
  if (input.vacatingStatus === 'rejected') return 'Declined';
  return 'Move-out';
}

/** Profile / home card detail — mirrors move-out page hero copy. */
export function residentHomeMoveOutDetail(input: {
  vacatingStatus: string | null;
  checkoutStatus: string | null;
  vacatingDate?: string | null;
  waterfall?: CheckoutSettlementWaterfall | null;
  today?: string;
}): string {
  const { vacatingStatus, checkoutStatus, vacatingDate, waterfall } = input;

  if (vacatingStatus === 'pending') {
    return 'Your vacate request is with the office for approval.';
  }
  if (
    checkoutStatus === 'refund_paid' ||
    checkoutStatus === 'completed' ||
    vacatingStatus === 'completed'
  ) {
    return RESIDENT_MOVE_OUT_COMPLETED;
  }

  const workflowLine = residentWorkflowStatusLine({
    vacatingStatus,
    checkoutStatus,
    vacatingDate,
    today: input.today,
  });
  if (workflowLine) return workflowLine;

  const settlementLabel = residentSettlementStatusLabel({ checkoutStatus, waterfall });
  if (settlementLabel) return settlementLabel;

  if (checkoutStatus === 'awaiting_resident_details') {
    return 'Submit your meter photo and UPI details for your deposit refund.';
  }

  const vacDate = vacatingDate?.slice(0, 10);
  if (vacatingStatus === 'approved' && vacDate) {
    if (isBeforeVacatingDate(vacDate, input.today)) {
      const countdown = refundUnlockCountdown({ vacatingDate: vacDate, today: input.today });
      return `${countdown.headline} · Approved move-out date ${formatDate(vacDate)}`;
    }
    return `Move-out date confirmed · ${formatDate(vacDate)}`;
  }

  return 'Track each step on your move-out page.';
}

export function currentStageLabel(
  vacatingStatus: string | null,
  checkoutStatus: string | null,
  vacatingDate?: string | null,
  durationMode?: string | null,
  today?: string,
): string {
  const index = vacatingStageIndex({
    vacatingStatus,
    checkoutStatus,
    vacatingDate,
    durationMode,
    today,
  });
  if (index === 2) {
    return refundRequestStageLabel({ vacatingDate, today });
  }
  return VACATING_JOURNEY_STAGES[index]?.label ?? 'Move-out';
}

export function buildVacatingTimelineStages(input: {
  vacatingStatus: string | null;
  checkoutStatus: string | null;
  vacatingDate?: string | null;
  durationMode?: string | null;
  checkoutSettlementSuppressed?: boolean;
  finalRefundPaise?: number | null;
  waterfall?: CheckoutSettlementWaterfall | null;
  today?: string;
}): Array<{ id: string; label: string; description?: string }> {
  const activeIndex = vacatingStageIndex({
    vacatingStatus: input.vacatingStatus,
    checkoutStatus: input.checkoutStatus,
    vacatingDate: input.vacatingDate,
    durationMode: input.durationMode,
    checkoutSettlementSuppressed: input.checkoutSettlementSuppressed,
    finalRefundPaise: input.finalRefundPaise,
    today: input.today,
  });

  const settlementStatus = residentSettlementStatusLabel({
    checkoutStatus: input.checkoutStatus,
    waterfall: input.waterfall,
  });

  return VACATING_JOURNEY_STAGES.map((s, i) => {
    let label = s.label;
    if (i === 2) {
      label = refundRequestStageLabel({ vacatingDate: input.vacatingDate, today: input.today });
    }
    let description: string | undefined;
    if (i === activeIndex) {
      const workflowLine = residentWorkflowStatusLine({
        vacatingStatus: input.vacatingStatus,
        checkoutStatus: input.checkoutStatus,
        vacatingDate: input.vacatingDate,
        today: input.today,
      });
      if (workflowLine) {
        description = workflowLine;
      } else if (i >= 3 && settlementStatus) {
        description = settlementStatus;
      } else {
        description = s.residentHint;
      }
    }
    return { id: s.id, label, description };
  });
}

export const ESTIMATED_REFUND_HELPER =
  'Final refund will be calculated after your final electricity reading and room inspection.';

export const SETTLEMENT_BREAKDOWN_PLACEHOLDER =
  'The detailed calculation will appear after your meter reading has been verified.';

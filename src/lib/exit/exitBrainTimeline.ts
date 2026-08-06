/**
 * Resident Exit Brain — move-out timeline projection (read-only).
 */
import type { ExitBrainProjectionInput } from '@/src/lib/exit/exitBrainPhase';

export type ExitTimelineEventId =
  | 'notice_submitted'
  | 'notice_approved'
  | 'penalties_frozen'
  | 'meter_uploaded'
  | 'electricity_calculated'
  | 'refund_requested'
  | 'refund_approved'
  | 'refund_paid';

export type ExitTimelineEventStatus = 'done' | 'pending' | 'skipped';

export type ExitTimelineEvent = {
  id: ExitTimelineEventId;
  label: string;
  occurredAt: string | null;
  status: ExitTimelineEventStatus;
};

export type ExitTimelineInput = ExitBrainProjectionInput & {
  noticeSubmittedAt: string | Date | null;
  noticeApprovedAt: string | Date | null;
  exitActivatedAt: string | Date | null;
  settlementCreatedAt: string | Date | null;
  settlementUpdatedAt: string | Date | null;
  settlementApprovedAt: string | Date | null;
  refundPaidAt: string | Date | null;
};

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00.000Z`;
  return s;
}

function eventStatus(done: boolean, skipped = false): ExitTimelineEventStatus {
  if (skipped) return 'skipped';
  return done ? 'done' : 'pending';
}

export function buildExitBrainTimeline(input: ExitTimelineInput): ExitTimelineEvent[] {
  const noticeSubmitted = input.vacatingStatus != null && input.vacatingStatus !== 'rejected';
  const noticeApproved =
    input.vacatingStatus === 'approved' ||
    input.vacatingStatus === 'completed' ||
    input.exitBrainStatus === 'active' ||
    input.exitBrainStatus === 'completed';
  const penaltiesFrozen = input.exitBrainStatus === 'active' || input.exitBrainStatus === 'completed';
  const meterUploaded = input.hasMeterPhoto && !input.meterPhotoMissing;
  const electricityCalculated =
    (input.electricitySharePaise != null && input.electricitySharePaise > 0) ||
    (!input.electricityEstimatedPending && input.settlementStatus === 'awaiting_admin_review');
  const refundRequested =
    input.hasPayoutDetails ||
    input.settlementStatus === 'awaiting_admin_review' ||
    input.settlementStatus === 'approved' ||
    input.settlementStatus === 'refund_pending' ||
    input.settlementStatus === 'refund_paid' ||
    input.settlementStatus === 'completed';
  const refundApproved =
    input.settlementStatus === 'refund_pending' ||
    input.settlementStatus === 'refund_paid' ||
    input.settlementStatus === 'completed' ||
    input.settlementApprovedAt != null;
  const refundPaid =
    input.refundPaidAt != null ||
    input.settlementStatus === 'refund_paid' ||
    input.settlementStatus === 'completed';

  return [
    {
      id: 'notice_submitted',
      label: 'Notice submitted',
      occurredAt: toIso(input.noticeSubmittedAt),
      status: eventStatus(noticeSubmitted, input.vacatingStatus === 'rejected'),
    },
    {
      id: 'notice_approved',
      label: 'Approved',
      occurredAt: toIso(input.noticeApprovedAt),
      status: eventStatus(noticeApproved),
    },
    {
      id: 'penalties_frozen',
      label: 'Late fee & notice penalty frozen',
      occurredAt: toIso(input.exitActivatedAt),
      status: eventStatus(penaltiesFrozen),
    },
    {
      id: 'meter_uploaded',
      label: 'Meter uploaded',
      occurredAt: meterUploaded ? toIso(input.settlementUpdatedAt) : null,
      status: eventStatus(meterUploaded),
    },
    {
      id: 'electricity_calculated',
      label: input.electricityEstimatedPending ? 'Electricity estimated' : 'Electricity calculated',
      occurredAt: electricityCalculated ? toIso(input.settlementUpdatedAt) : null,
      status: eventStatus(electricityCalculated),
    },
    {
      id: 'refund_requested',
      label: 'Refund requested',
      occurredAt: refundRequested ? toIso(input.settlementUpdatedAt) : null,
      status: eventStatus(refundRequested),
    },
    {
      id: 'refund_approved',
      label: 'Refund approved',
      occurredAt: toIso(input.settlementApprovedAt),
      status: eventStatus(refundApproved),
    },
    {
      id: 'refund_paid',
      label: 'Refund paid',
      occurredAt: toIso(input.refundPaidAt),
      status: eventStatus(refundPaid),
    },
  ];
}

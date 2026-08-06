/**
 * Resident Exit Brain — derived operational phase (automation / UX SSOT).
 * DB lifecycle remains active | completed for freeze semantics.
 */
import type { CheckoutSettlementStatus } from '@/src/db/schema/enums';

export type ExitBrainPhase =
  | 'inactive'
  | 'notice_submitted'
  | 'notice_approved'
  | 'room_inspection'
  | 'waiting_meter'
  | 'settlement_ready'
  | 'waiting_refund'
  | 'refund_completed'
  | 'completed';

export const EXIT_BRAIN_PHASE_LABELS: Record<ExitBrainPhase, string> = {
  inactive: 'Not in exit',
  notice_submitted: 'Notice submitted',
  notice_approved: 'Notice approved',
  room_inspection: 'Room inspection',
  waiting_meter: 'Waiting for meter',
  settlement_ready: 'Settlement ready',
  waiting_refund: 'Waiting for refund',
  refund_completed: 'Refund completed',
  completed: 'Exit completed',
};

export type ExitBrainProjectionInput = {
  vacatingStatus: 'pending' | 'approved' | 'completed' | 'rejected' | null;
  exitBrainStatus: 'active' | 'completed' | null;
  settlementStatus: CheckoutSettlementStatus | null;
  hasMeterPhoto: boolean;
  meterPhotoMissing: boolean;
  electricitySharePaise: number | null;
  electricityEstimatedPending: boolean;
  refundPaidAt: string | Date | null;
  hasPayoutDetails: boolean;
};

export function resolveExitBrainPhase(input: ExitBrainProjectionInput): ExitBrainPhase {
  const { vacatingStatus, exitBrainStatus, settlementStatus } = input;

  if (!vacatingStatus || vacatingStatus === 'rejected') return 'inactive';

  if (
    vacatingStatus === 'completed' ||
    exitBrainStatus === 'completed' ||
    settlementStatus === 'completed' ||
    settlementStatus === 'archived'
  ) {
    if (input.refundPaidAt || settlementStatus === 'refund_paid') {
      return 'refund_completed';
    }
    return 'completed';
  }

  if (vacatingStatus === 'pending') return 'notice_submitted';

  if (settlementStatus === 'refund_paid' || input.refundPaidAt) {
    return 'refund_completed';
  }

  if (settlementStatus === 'refund_pending') return 'waiting_refund';

  if (
    settlementStatus === 'awaiting_admin_review' ||
    settlementStatus === 'approved' ||
    (settlementStatus &&
      input.electricitySharePaise != null &&
      input.electricitySharePaise > 0 &&
      !input.electricityEstimatedPending)
  ) {
    return 'settlement_ready';
  }

  if (
    settlementStatus === 'awaiting_resident_details' ||
    !input.hasMeterPhoto ||
    input.meterPhotoMissing ||
    input.electricityEstimatedPending
  ) {
    if (settlementStatus === 'awaiting_resident_details' && !input.hasPayoutDetails) {
      return 'room_inspection';
    }
    if (!input.hasMeterPhoto || input.meterPhotoMissing || input.electricityEstimatedPending) {
      return 'waiting_meter';
    }
  }

  if (exitBrainStatus === 'active' || vacatingStatus === 'approved') {
    return settlementStatus ? 'room_inspection' : 'notice_approved';
  }

  return 'inactive';
}

export function exitBrainPhaseLabel(phase: ExitBrainPhase): string {
  return EXIT_BRAIN_PHASE_LABELS[phase];
}

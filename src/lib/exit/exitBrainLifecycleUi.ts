/**
 * Exit Brain lifecycle — UI helpers (consume lifecycle, not raw vacating status).
 */
import type { ResidentExitBrainSnapshot } from '@/src/lib/exit/exitBrainTypes';
import type { PgBedMapVacating } from '@/src/services/pgBedMap';
import {
  buildExitBrainLifecycle,
  type ExitBrainLifecycle,
  type ExitBrainLifecycleState,
} from '@/src/lib/exit/exitBrainStateMachine';

const INACTIVE_LIFECYCLE_INPUT = {
  vacatingStatus: null,
  exitBrainStatus: null,
  settlementStatus: null,
  hasMeterPhoto: false,
  meterPhotoMissing: false,
  electricitySharePaise: null,
  electricityEstimatedPending: true,
  refundPaidAt: null,
  hasPayoutDetails: false,
  hasSettlement: false,
} as const;

export function defaultInactiveExitLifecycle(): ExitBrainLifecycle {
  return buildExitBrainLifecycle(INACTIVE_LIFECYCLE_INPUT);
}

export function resolveExitLifecycleFromSnapshot(
  snapshot: ResidentExitBrainSnapshot | null | undefined,
): ExitBrainLifecycle {
  return snapshot?.lifecycle ?? defaultInactiveExitLifecycle();
}

/** Move-out journey in progress (not inactive / archived). */
export function isMoveOutLifecycleActive(lifecycle: ExitBrainLifecycle): boolean {
  return lifecycle.state !== 'inactive' && lifecycle.state !== 'archived';
}

export function isMoveOutLifecycleComplete(lifecycle: ExitBrainLifecycle): boolean {
  return lifecycle.state === 'archived' || lifecycle.state === 'refund_completed';
}

export function residentMoveOutStatusLabel(lifecycle: ExitBrainLifecycle): string {
  if (lifecycle.state === 'inactive') return 'No move-out';
  return lifecycle.stateLabel;
}

export function residentMoveOutHint(lifecycle: ExitBrainLifecycle): string {
  switch (lifecycle.state) {
    case 'notice_submitted':
      return 'Your request is waiting for admin approval. Refund and final settlement are calculated only after approval.';
    case 'notice_approved':
    case 'exit_active':
      return 'Vacate approved — deposit refund unlocks on your vacate date.';
    case 'checkout_pending':
      return 'Checkout in progress — submit your final meter photo and UPI when ready.';
    case 'checkout_completed':
    case 'refund_pending':
      return 'Settlement approved — your refund is being processed.';
    case 'refund_completed':
    case 'archived':
      return 'Move-out complete. See your resident area for final settlement details.';
    default:
      return 'See your resident area for request details.';
  }
}

/** Best-effort lifecycle from bed-map vacating row (admin map; full snapshot preferred). */
export function buildExitLifecycleFromBedVacating(vacating: PgBedMapVacating): ExitBrainLifecycle {
  return buildExitBrainLifecycle({
    vacatingStatus: vacating.status,
    exitBrainStatus: vacating.status === 'approved' ? 'active' : null,
    settlementStatus: vacating.settlementId ? 'awaiting_resident_details' : null,
    hasMeterPhoto: false,
    meterPhotoMissing: false,
    electricitySharePaise: null,
    electricityEstimatedPending: true,
    refundPaidAt: null,
    hasPayoutDetails: false,
    hasSettlement: Boolean(vacating.settlementId),
  });
}

export function isNoticeSubmittedState(state: ExitBrainLifecycleState): boolean {
  return state === 'notice_submitted';
}

export function isNoticeApprovedOrExitActive(state: ExitBrainLifecycleState): boolean {
  return state === 'notice_approved' || state === 'exit_active';
}

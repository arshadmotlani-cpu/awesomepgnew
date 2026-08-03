/**
 * Pure payment proof workflow state machine — Wave 6.
 */

import type { PaymentProofWorkflowState } from '@/src/roomOs/workflow/types';

const TERMINAL_STATES = new Set<PaymentProofWorkflowState>(['approved']);

export function canTransitionPaymentProofWorkflow(
  from: PaymentProofWorkflowState,
  to: PaymentProofWorkflowState,
): boolean {
  if (from === to) return true;
  if (TERMINAL_STATES.has(from)) return false;

  switch (from) {
    case 'submitted':
      return to === 'under_review';
    case 'under_review':
      return to === 'approved' || to === 'rejected';
    case 'rejected':
      return to === 'resubmitted' || to === 'under_review';
    case 'resubmitted':
      return to === 'under_review';
    default:
      return false;
  }
}

export function assertPaymentProofTransition(
  from: PaymentProofWorkflowState,
  to: PaymentProofWorkflowState,
): void {
  if (!canTransitionPaymentProofWorkflow(from, to)) {
    throw new Error(`Invalid payment proof workflow transition: ${from} → ${to}`);
  }
}

export function initialPaymentProofWorkflowState(): PaymentProofWorkflowState {
  return 'submitted';
}

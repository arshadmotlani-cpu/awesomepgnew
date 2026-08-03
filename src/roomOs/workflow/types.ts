/**
 * Payment proof workflow types — Wave 6 orchestration layer.
 */

import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

export type PaymentProofWorkflowState =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'resubmitted';

export type WorkflowType = 'payment_proof_v1';

export type WorkflowTransition = {
  id: string;
  fromState: PaymentProofWorkflowState | null;
  toState: PaymentProofWorkflowState;
  occurredAt: string;
  actorId?: string;
  reason?: string;
  idempotencyKey?: string;
};

export type WorkflowInstance = {
  id: string;
  workflowType: WorkflowType;
  reviewKey: string;
  entityKind: PendingPaymentReviewItem['kind'];
  entityId: string;
  bookingId: string | null;
  pgId: string;
  currentState: PaymentProofWorkflowState;
  idempotencyKey: string | null;
  payload: Record<string, unknown>;
  transitions: WorkflowTransition[];
  createdAt: string;
  updatedAt: string;
};

export type PaymentProofWorkflowContext = {
  reviewKey: string;
  entityKind: PendingPaymentReviewItem['kind'];
  entityId: string;
  bookingId: string | null;
  pgId: string;
};

/**
 * Workflow instance DB row types — Wave 6.
 */

import type { PaymentProofWorkflowState, WorkflowTransition, WorkflowType } from '@/src/roomOs/workflow/types';

export type WorkflowInstanceSnapshot = {
  workflowType: WorkflowType;
  reviewKey: string;
  entityKind: string;
  entityId: string;
  bookingId: string | null;
  pgId: string;
  currentState: PaymentProofWorkflowState;
  idempotencyKey: string | null;
  payload: Record<string, unknown>;
  transitions: WorkflowTransition[];
};

export type WorkflowInstanceRow = WorkflowInstanceSnapshot & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Approve payment proof via Payment SSOT — workflow orchestrates only.
 */

import type { AdminSession } from '@/src/lib/auth/session';
import { enqueuePropertyIndexRebuildFromWriter } from '@/src/roomOs/outbox/writerRebuild';
import { db } from '@/src/db/client';
import { emitWorkflowPaymentProofFact } from '@/src/roomOs/workflow/emitWorkflowFact';
import { loadWorkflowInstanceByIdempotencyKey, loadWorkflowInstanceByReviewKey } from '@/src/roomOs/workflow/store/loadInstance';
import { transitionPaymentProofWorkflow } from '@/src/roomOs/workflow/store/transitionWorkflow';
import { submitPaymentProofReview } from '@/src/roomOs/workflow/orchestrate/submitReview';
import type { PaymentProofWorkflowContext } from '@/src/roomOs/workflow/types';
import type { WorkflowInstance } from '@/src/roomOs/workflow/types';
import {
  approvePaymentProofWithAllocation,
  type PaymentProofAllocationInput,
} from '@/src/services/paymentProofAllocationApproval';
import { firstOfMonth } from '@/src/services/billing';
import { todayString } from '@/src/lib/dates';

export type ApprovePaymentProofWorkflowInput = {
  context: PaymentProofWorkflowContext;
  session: AdminSession;
  allocation: PaymentProofAllocationInput;
  idempotencyKey?: string;
  reviewMeta?: {
    reviewNotes?: string;
    approvalNotes?: string;
  };
};

export type ApprovePaymentProofWorkflowResult =
  | { ok: true; instance: WorkflowInstance; outcome: 'approved' | 'already_approved' }
  | { ok: false; message: string };

export async function orchestrateApprovePaymentProof(
  input: ApprovePaymentProofWorkflowInput,
): Promise<ApprovePaymentProofWorkflowResult> {
  if (input.idempotencyKey) {
    const prior = await loadWorkflowInstanceByIdempotencyKey(input.idempotencyKey);
    if (prior?.currentState === 'approved') {
      return { ok: true, instance: prior, outcome: 'already_approved' };
    }
  }

  const existing = await loadWorkflowInstanceByReviewKey(input.context.reviewKey);
  if (existing?.currentState !== 'under_review') {
    await submitPaymentProofReview({
      context: input.context,
      actorId: input.session.adminId,
    });
  }

  const paymentResult = await approvePaymentProofWithAllocation(input.session, {
    kind: input.context.entityKind,
    entityId: input.context.entityId,
    pgId: input.context.pgId,
    allocation: input.allocation,
    reviewMeta: input.reviewMeta,
  });

  if (!paymentResult.ok) {
    return { ok: false, message: paymentResult.message };
  }

  let transitionResult;
  try {
    transitionResult = await transitionPaymentProofWorkflow({
      context: input.context,
      toState: 'approved',
      actorId: input.session.adminId,
      idempotencyKey: input.idempotencyKey,
      payload: {
        action: 'approve',
        allocation: input.allocation,
        paymentOutcome: paymentResult.outcome ?? 'approved',
      },
    });
  } catch {
    return {
      ok: false,
      message:
        'Payment was approved but workflow state could not be updated. Reconcile manually.',
    };
  }

  const { instance, transition, noop } = transitionResult;

  if (!noop) {
    await emitWorkflowPaymentProofFact({
      eventType: 'workflow.payment_proof.approved',
      context: input.context,
      transition,
      payload: { allocation: input.allocation },
    });

    await db.transaction(async (tx) => {
      await enqueuePropertyIndexRebuildFromWriter(tx, {
        pgId: input.context.pgId,
        billingMonth: firstOfMonth(todayString()),
        sourceRef: `workflow.approve:${input.context.reviewKey}`,
      });
    });
  }

  return {
    ok: true,
    instance,
    outcome: paymentResult.outcome === 'already_approved' ? 'already_approved' : 'approved',
  };
}

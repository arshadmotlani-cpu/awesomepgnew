/**
 * Mark payment proof under review — idempotent submit.
 */

import { enqueuePropertyIndexRebuildFromWriter } from '@/src/roomOs/outbox/writerRebuild';
import { db } from '@/src/db/client';
import { emitWorkflowPaymentProofFact } from '@/src/roomOs/workflow/emitWorkflowFact';
import { loadWorkflowInstanceByReviewKey } from '@/src/roomOs/workflow/store/loadInstance';
import { transitionPaymentProofWorkflow } from '@/src/roomOs/workflow/store/transitionWorkflow';
import type { PaymentProofWorkflowContext } from '@/src/roomOs/workflow/types';
import type { WorkflowInstance } from '@/src/roomOs/workflow/types';
import { firstOfMonth } from '@/src/services/billing';
import { todayString } from '@/src/lib/dates';

export type SubmitPaymentProofReviewInput = {
  context: PaymentProofWorkflowContext;
  actorId?: string;
};

export type SubmitPaymentProofReviewResult =
  | { ok: true; instance: WorkflowInstance; alreadyUnderReview: boolean }
  | { ok: false; message: string };

export async function submitPaymentProofReview(
  input: SubmitPaymentProofReviewInput,
): Promise<SubmitPaymentProofReviewResult> {
  const existing = await loadWorkflowInstanceByReviewKey(input.context.reviewKey);
  if (existing && (existing.currentState === 'under_review' || existing.currentState === 'approved')) {
    return { ok: true, instance: existing, alreadyUnderReview: true };
  }

  const { instance, transition, noop } = await transitionPaymentProofWorkflow({
    context: input.context,
    toState: 'under_review',
    actorId: input.actorId,
    payload: { action: 'submit_review' },
  });

  if (!noop) {
    await emitWorkflowPaymentProofFact({
      eventType: 'workflow.payment_proof.submitted',
      context: input.context,
      transition,
    });

    await db.transaction(async (tx) => {
      await enqueuePropertyIndexRebuildFromWriter(tx, {
        pgId: input.context.pgId,
        billingMonth: firstOfMonth(todayString()),
        sourceRef: `workflow.submit:${input.context.reviewKey}`,
      });
    });
  }

  return { ok: true, instance, alreadyUnderReview: noop };
}

/**
 * Reject payment proof via Payment SSOT — workflow orchestrates only.
 */

import type { AdminSession } from '@/src/lib/auth/session';
import type { PaymentProofRejectionReasonCode } from '@/src/lib/approvals/paymentProofRejectionReasons';
import { enqueuePropertyIndexRebuildFromWriter } from '@/src/roomOs/outbox/writerRebuild';
import { db } from '@/src/db/client';
import { emitWorkflowPaymentProofFact } from '@/src/roomOs/workflow/emitWorkflowFact';
import { submitPaymentProofReview } from '@/src/roomOs/workflow/orchestrate/submitReview';
import { loadWorkflowInstanceByReviewKey } from '@/src/roomOs/workflow/store/loadInstance';
import { transitionPaymentProofWorkflow } from '@/src/roomOs/workflow/store/transitionWorkflow';
import type { PaymentProofWorkflowContext } from '@/src/roomOs/workflow/types';
import type { WorkflowInstance } from '@/src/roomOs/workflow/types';
import {
  rejectPaymentProof,
  reviewKindToEntityType,
} from '@/src/services/paymentProofRejectionService';
import { firstOfMonth } from '@/src/services/billing';
import { todayString } from '@/src/lib/dates';

export type RejectPaymentProofWorkflowInput = {
  context: PaymentProofWorkflowContext;
  session: AdminSession;
  reasonCode: PaymentProofRejectionReasonCode;
  reasonDetail?: string;
  adminNote?: string;
  residentMessage: string;
  sendWhatsApp: boolean;
  contextMeta?: {
    customerId?: string | null;
    pgId?: string;
    bookingId?: string | null;
    residentName?: string;
    phone?: string | null;
    billLabel?: string;
    amountPaise?: number;
  };
};

export type RejectPaymentProofWorkflowResult =
  | { ok: true; instance: WorkflowInstance; rejectionId: string; whatsappUrl?: string }
  | { ok: false; message: string };

export async function orchestrateRejectPaymentProof(
  input: RejectPaymentProofWorkflowInput,
): Promise<RejectPaymentProofWorkflowResult> {
  const entityType = reviewKindToEntityType(input.context.entityKind);

  const existing = await loadWorkflowInstanceByReviewKey(input.context.reviewKey);
  if (existing?.currentState !== 'under_review') {
    await submitPaymentProofReview({
      context: input.context,
      actorId: input.session.adminId,
    });
  }

  const paymentResult = await rejectPaymentProof(input.session, {
    reviewKey: input.context.reviewKey,
    entityType,
    entityId: input.context.entityId,
    reasonCode: input.reasonCode,
    reasonDetail: input.reasonDetail,
    adminNote: input.adminNote,
    residentMessage: input.residentMessage,
    sendWhatsApp: input.sendWhatsApp,
    context: input.contextMeta,
  });

  if (!paymentResult.ok) {
    return { ok: false, message: paymentResult.message };
  }

  let transitionResult;
  try {
    transitionResult = await transitionPaymentProofWorkflow({
      context: input.context,
      toState: 'rejected',
      actorId: input.session.adminId,
      reason: input.reasonCode,
      payload: {
        action: 'reject',
        reasonCode: input.reasonCode,
        rejectionId: paymentResult.rejectionId,
      },
    });
  } catch {
    return {
      ok: false,
      message:
        'Payment proof was rejected but workflow state could not be updated. Reconcile manually.',
    };
  }

  const { instance, transition, noop } = transitionResult;

  if (!noop) {
    await emitWorkflowPaymentProofFact({
      eventType: 'workflow.payment_proof.rejected',
      context: input.context,
      transition,
      payload: { reasonCode: input.reasonCode, rejectionId: paymentResult.rejectionId },
    });

    await db.transaction(async (tx) => {
      await enqueuePropertyIndexRebuildFromWriter(tx, {
        pgId: input.context.pgId,
        billingMonth: firstOfMonth(todayString()),
        sourceRef: `workflow.reject:${input.context.reviewKey}`,
      });
    });
  }

  return {
    ok: true,
    instance,
    rejectionId: paymentResult.rejectionId,
    whatsappUrl: paymentResult.whatsappUrl,
  };
}

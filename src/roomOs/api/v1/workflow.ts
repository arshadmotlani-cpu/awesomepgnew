/**
 * workflow/v1 — payment proof workflow orchestration APIs.
 */

import type { AdminSession } from '@/src/lib/auth/session';
import type { PaymentProofRejectionReasonCode } from '@/src/lib/approvals/paymentProofRejectionReasons';
import { orchestrateApprovePaymentProof } from '@/src/roomOs/workflow/orchestrate/approvePaymentProof';
import { orchestrateRejectPaymentProof } from '@/src/roomOs/workflow/orchestrate/rejectPaymentProof';
import { submitPaymentProofReview } from '@/src/roomOs/workflow/orchestrate/submitReview';
import {
  buildPaymentProofReviewKey,
  parsePaymentProofReviewKey,
  withPaymentProofContext,
} from '@/src/roomOs/workflow/resolveReviewKey';
import { loadWorkflowInstanceByReviewKey } from '@/src/roomOs/workflow/store/loadInstance';
import { initialPaymentProofWorkflowState } from '@/src/roomOs/workflow/stateMachine';
import type { PaymentProofWorkflowContext, PaymentProofWorkflowState, WorkflowInstance } from '@/src/roomOs/workflow/types';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import type { PaymentProofAllocationInput } from '@/src/services/paymentProofAllocationApproval';

export type GetPaymentProofStateInput = {
  reviewKey?: string;
  kind?: PendingPaymentReviewItem['kind'];
  entityId?: string;
  pgId?: string;
  bookingId?: string | null;
};

export type PaymentProofStateResult = {
  apiVersion: 'workflow/v1';
  reviewKey: string;
  currentState: PaymentProofWorkflowState;
  instance: WorkflowInstance | null;
  derived: boolean;
};

export async function getPaymentProofState(
  input: GetPaymentProofStateInput,
): Promise<PaymentProofStateResult> {
  const reviewKey =
    input.reviewKey ??
    (input.kind && input.entityId ? buildPaymentProofReviewKey(input.kind, input.entityId) : null);

  if (!reviewKey) {
    throw new Error('reviewKey or (kind + entityId) required.');
  }

  const instance = await loadWorkflowInstanceByReviewKey(reviewKey);
  if (instance) {
    return {
      apiVersion: 'workflow/v1',
      reviewKey,
      currentState: instance.currentState,
      instance,
      derived: false,
    };
  }

  return {
    apiVersion: 'workflow/v1',
    reviewKey,
    currentState: initialPaymentProofWorkflowState(),
    instance: null,
    derived: true,
  };
}

function resolveContext(input: {
  reviewKey?: string;
  kind?: PendingPaymentReviewItem['kind'];
  entityId?: string;
  pgId: string;
  bookingId?: string | null;
}): PaymentProofWorkflowContext {
  if (input.reviewKey) {
    const parsed = parsePaymentProofReviewKey(input.reviewKey);
    if (!parsed) throw new Error('Invalid reviewKey format.');
    return withPaymentProofContext(parsed, {
      pgId: input.pgId,
      bookingId: input.bookingId,
    });
  }
  if (!input.kind || !input.entityId) {
    throw new Error('reviewKey or (kind + entityId) required.');
  }
  return {
    reviewKey: buildPaymentProofReviewKey(input.kind, input.entityId),
    entityKind: input.kind,
    entityId: input.entityId,
    pgId: input.pgId,
    bookingId: input.bookingId ?? null,
  };
}

export async function submitPaymentProofReviewApi(input: {
  reviewKey?: string;
  kind?: PendingPaymentReviewItem['kind'];
  entityId?: string;
  pgId: string;
  bookingId?: string | null;
  actorId?: string;
}) {
  const context = resolveContext(input);
  const result = await submitPaymentProofReview({ context, actorId: input.actorId });
  if (!result.ok) return { apiVersion: 'workflow/v1' as const, ok: false as const, message: result.message };
  return {
    apiVersion: 'workflow/v1' as const,
    ok: true as const,
    instance: result.instance,
    alreadyUnderReview: result.alreadyUnderReview,
  };
}

export async function approvePaymentProofApi(input: {
  session: AdminSession;
  reviewKey?: string;
  kind?: PendingPaymentReviewItem['kind'];
  entityId?: string;
  pgId: string;
  bookingId?: string | null;
  allocation: PaymentProofAllocationInput;
  idempotencyKey?: string;
  reviewMeta?: { reviewNotes?: string; approvalNotes?: string };
}) {
  const context = resolveContext(input);
  const result = await orchestrateApprovePaymentProof({
    context,
    session: input.session,
    allocation: input.allocation,
    idempotencyKey: input.idempotencyKey,
    reviewMeta: input.reviewMeta,
  });
  if (!result.ok) return { apiVersion: 'workflow/v1' as const, ok: false as const, message: result.message };
  return {
    apiVersion: 'workflow/v1' as const,
    ok: true as const,
    instance: result.instance,
    outcome: result.outcome,
  };
}

export async function rejectPaymentProofApi(input: {
  session: AdminSession;
  reviewKey?: string;
  kind?: PendingPaymentReviewItem['kind'];
  entityId?: string;
  pgId: string;
  bookingId?: string | null;
  reasonCode: PaymentProofRejectionReasonCode;
  reasonDetail?: string;
  adminNote?: string;
  residentMessage: string;
  sendWhatsApp: boolean;
  contextMeta?: RejectPaymentProofWorkflowContextMeta;
}) {
  const context = resolveContext(input);
  const result = await orchestrateRejectPaymentProof({
    context,
    session: input.session,
    reasonCode: input.reasonCode,
    reasonDetail: input.reasonDetail,
    adminNote: input.adminNote,
    residentMessage: input.residentMessage,
    sendWhatsApp: input.sendWhatsApp,
    contextMeta: input.contextMeta,
  });
  if (!result.ok) return { apiVersion: 'workflow/v1' as const, ok: false as const, message: result.message };
  return {
    apiVersion: 'workflow/v1' as const,
    ok: true as const,
    instance: result.instance,
    rejectionId: result.rejectionId,
    whatsappUrl: result.whatsappUrl,
  };
}

export type RejectPaymentProofWorkflowContextMeta = {
  customerId?: string | null;
  pgId?: string;
  bookingId?: string | null;
  residentName?: string;
  phone?: string | null;
  billLabel?: string;
  amountPaise?: number;
};

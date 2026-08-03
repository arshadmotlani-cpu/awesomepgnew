/**
 * Append workflow transition and update current state.
 */

import { randomUUID } from 'node:crypto';
import { db } from '@/src/db/client';
import {
  loadWorkflowInstanceByReviewKey,
  loadWorkflowInstanceByReviewKeyForUpdate,
} from '@/src/roomOs/workflow/store/loadInstance';
import { persistWorkflowInstance } from '@/src/roomOs/workflow/store/persistInstance';
import {
  assertPaymentProofTransition,
  initialPaymentProofWorkflowState,
} from '@/src/roomOs/workflow/stateMachine';
import type { PaymentProofWorkflowContext } from '@/src/roomOs/workflow/types';
import type { PaymentProofWorkflowState, WorkflowInstance, WorkflowTransition } from '@/src/roomOs/workflow/types';

export type TransitionWorkflowInput = {
  context: PaymentProofWorkflowContext;
  toState: PaymentProofWorkflowState;
  actorId?: string;
  reason?: string;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
};

export type TransitionWorkflowResult = {
  instance: WorkflowInstance;
  transition: WorkflowTransition;
  noop: boolean;
};

export async function transitionPaymentProofWorkflow(
  input: TransitionWorkflowInput,
): Promise<TransitionWorkflowResult> {
  const preflight = await loadWorkflowInstanceByReviewKey(input.context.reviewKey);
  const preflightFromState = preflight?.currentState ?? initialPaymentProofWorkflowState();

  if (preflightFromState === input.toState && preflight) {
    return {
      instance: preflight,
      transition: preflight.transitions[preflight.transitions.length - 1]!,
      noop: true,
    };
  }

  return db.transaction(async (tx) => {
    const existing = await loadWorkflowInstanceByReviewKeyForUpdate(input.context.reviewKey, tx);
    const fromState = existing?.currentState ?? initialPaymentProofWorkflowState();

    if (fromState === input.toState) {
      if (existing) {
        return {
          instance: existing,
          transition: existing.transitions[existing.transitions.length - 1]!,
          noop: true,
        };
      }
    }

    assertPaymentProofTransition(fromState, input.toState);

    const transition: WorkflowTransition = {
      id: randomUUID(),
      fromState,
      toState: input.toState,
      occurredAt: new Date().toISOString(),
      actorId: input.actorId,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    };

    const transitions = [...(existing?.transitions ?? []), transition];
    const instance = await persistWorkflowInstance(
      {
        workflowType: 'payment_proof_v1',
        reviewKey: input.context.reviewKey,
        entityKind: input.context.entityKind,
        entityId: input.context.entityId,
        bookingId: input.context.bookingId,
        pgId: input.context.pgId,
        currentState: input.toState,
        idempotencyKey: input.idempotencyKey ?? existing?.idempotencyKey ?? null,
        payload: { ...(existing?.payload ?? {}), ...(input.payload ?? {}) },
        transitions,
      },
      tx,
    );

    return { instance, transition, noop: false };
  });
}

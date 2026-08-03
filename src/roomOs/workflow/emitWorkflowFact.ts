/**
 * Emit workflow outbox facts — Layer A.
 */

import { appendRoomOsOutboxEntry, type RoomOsDb } from '@/src/roomOs/outbox/append';
import { resolveEffectivePackId } from '@/src/roomOs/rules/store/resolveEffectivePackId';
import { RULES_CATALOG_V1_ID } from '@/src/roomOs/rules/catalog/v1';
import type { RoomOsEventEnvelope } from '@/src/roomOs/types';
import type { PaymentProofWorkflowContext } from '@/src/roomOs/workflow/types';
import type { WorkflowTransition } from '@/src/roomOs/workflow/types';

export type WorkflowOutboxEventType =
  | 'workflow.payment_proof.submitted'
  | 'workflow.payment_proof.approved'
  | 'workflow.payment_proof.rejected';

export async function emitWorkflowPaymentProofFact(
  input: {
    eventType: WorkflowOutboxEventType;
    context: PaymentProofWorkflowContext;
    transition: WorkflowTransition;
    payload?: Record<string, unknown>;
  },
  tx?: RoomOsDb,
): Promise<RoomOsEventEnvelope> {
  const asOf = new Date().toISOString();
  let rulesEffectivePackId = RULES_CATALOG_V1_ID;
  try {
    rulesEffectivePackId = await resolveEffectivePackId({
      pgId: input.context.pgId,
      asOf,
    });
  } catch {
    rulesEffectivePackId = RULES_CATALOG_V1_ID;
  }

  const streamId = input.context.pgId;
  const streamType = 'property' as const;

  return appendRoomOsOutboxEntry(
    {
      streamType,
      streamId,
      eventType: input.eventType,
      rulesEffectivePackId,
      payload: {
        reviewKey: input.context.reviewKey,
        entityKind: input.context.entityKind,
        entityId: input.context.entityId,
        bookingId: input.context.bookingId,
        pgId: input.context.pgId,
        fromState: input.transition.fromState,
        toState: input.transition.toState,
        ...(input.payload ?? {}),
      },
      sourceRef: input.transition.id,
    },
    tx,
  );
}

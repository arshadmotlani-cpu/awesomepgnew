/**
 * Load workflow instance by review key or idempotency key.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { roomOsWorkflowInstances } from '@/src/db/schema/roomOsWorkflowInstances';
import type { WorkflowInstanceRow } from '@/src/roomOs/workflow/store/types';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import type { WorkflowInstance } from '@/src/roomOs/workflow/types';

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function mapRow(row: typeof roomOsWorkflowInstances.$inferSelect): WorkflowInstance {
  return {
    id: row.id,
    workflowType: row.workflowType as WorkflowInstance['workflowType'],
    reviewKey: row.reviewKey,
    entityKind: row.entityKind as PendingPaymentReviewItem['kind'],
    entityId: row.entityId,
    bookingId: row.bookingId,
    pgId: row.pgId,
    currentState: row.currentState,
    idempotencyKey: row.idempotencyKey,
    payload: row.payload,
    transitions: row.transitions,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function loadWorkflowInstanceByReviewKey(
  reviewKey: string,
): Promise<WorkflowInstance | null> {
  const [row] = await db
    .select()
    .from(roomOsWorkflowInstances)
    .where(eq(roomOsWorkflowInstances.reviewKey, reviewKey))
    .limit(1);

  return row ? mapRow(row) : null;
}

export async function loadWorkflowInstanceByReviewKeyForUpdate(
  reviewKey: string,
  tx: DbTx,
): Promise<WorkflowInstance | null> {
  const [row] = await tx
    .select()
    .from(roomOsWorkflowInstances)
    .where(eq(roomOsWorkflowInstances.reviewKey, reviewKey))
    .for('update')
    .limit(1);

  return row ? mapRow(row) : null;
}

export async function loadWorkflowInstanceByIdempotencyKey(
  idempotencyKey: string,
): Promise<WorkflowInstance | null> {
  const [row] = await db
    .select()
    .from(roomOsWorkflowInstances)
    .where(eq(roomOsWorkflowInstances.idempotencyKey, idempotencyKey))
    .limit(1);

  return row ? mapRow(row) : null;
}

export type { WorkflowInstanceRow };

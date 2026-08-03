/**
 * Persist workflow instance — create or update current state snapshot.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { roomOsWorkflowInstances } from '@/src/db/schema/roomOsWorkflowInstances';
import type { WorkflowInstanceSnapshot } from '@/src/roomOs/workflow/store/types';
import type { WorkflowInstance } from '@/src/roomOs/workflow/types';

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function mapRow(row: typeof roomOsWorkflowInstances.$inferSelect): WorkflowInstance {
  return {
    id: row.id,
    workflowType: row.workflowType as WorkflowInstance['workflowType'],
    reviewKey: row.reviewKey,
    entityKind: row.entityKind as WorkflowInstance['entityKind'],
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

export async function persistWorkflowInstance(
  snapshot: WorkflowInstanceSnapshot,
  tx?: DbTx,
): Promise<WorkflowInstance> {
  const executor = tx ?? db;
  const now = new Date();
  const [row] = await executor
    .insert(roomOsWorkflowInstances)
    .values({
      workflowType: snapshot.workflowType,
      reviewKey: snapshot.reviewKey,
      entityKind: snapshot.entityKind,
      entityId: snapshot.entityId,
      bookingId: snapshot.bookingId,
      pgId: snapshot.pgId,
      currentState: snapshot.currentState,
      idempotencyKey: snapshot.idempotencyKey,
      payload: snapshot.payload,
      transitions: snapshot.transitions,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: roomOsWorkflowInstances.reviewKey,
      set: {
        currentState: snapshot.currentState,
        idempotencyKey: snapshot.idempotencyKey,
        payload: snapshot.payload,
        transitions: snapshot.transitions,
        updatedAt: now,
      },
    })
    .returning();

  return mapRow(row);
}

export async function updateWorkflowInstanceByReviewKey(
  reviewKey: string,
  snapshot: Partial<WorkflowInstanceSnapshot>,
): Promise<WorkflowInstance | null> {
  const now = new Date();
  const [row] = await db
    .update(roomOsWorkflowInstances)
    .set({
      ...(snapshot.currentState ? { currentState: snapshot.currentState } : {}),
      ...(snapshot.idempotencyKey !== undefined ? { idempotencyKey: snapshot.idempotencyKey } : {}),
      ...(snapshot.payload ? { payload: snapshot.payload } : {}),
      ...(snapshot.transitions ? { transitions: snapshot.transitions } : {}),
      updatedAt: now,
    })
    .where(eq(roomOsWorkflowInstances.reviewKey, reviewKey))
    .returning();

  return row ? mapRow(row) : null;
}

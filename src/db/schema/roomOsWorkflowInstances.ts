import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { WorkflowInstanceSnapshot } from '@/src/roomOs/workflow/store/types';
import { pgs } from './pgs';

export const PAYMENT_PROOF_WORKFLOW_STATES = [
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'resubmitted',
] as const;

export type PaymentProofWorkflowStateDb = (typeof PAYMENT_PROOF_WORKFLOW_STATES)[number];

/** Payment proof workflow orchestration instances — Wave 6 audit layer (not payment SSOT). */
export const roomOsWorkflowInstances = pgTable(
  'room_os_workflow_instances',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    workflowType: text('workflow_type').notNull().default('payment_proof_v1'),
    reviewKey: text('review_key').notNull(),
    entityKind: text('entity_kind').notNull(),
    entityId: uuid('entity_id').notNull(),
    bookingId: uuid('booking_id'),
    pgId: uuid('pg_id')
      .notNull()
      .references(() => pgs.id, { onDelete: 'cascade' }),
    currentState: text('current_state').$type<PaymentProofWorkflowStateDb>().notNull(),
    idempotencyKey: text('idempotency_key'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    transitions: jsonb('transitions').$type<WorkflowInstanceSnapshot['transitions']>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('room_os_workflow_instances_review_key_unique').on(t.reviewKey),
    uniqueIndex('room_os_workflow_instances_idempotency_key_unique').on(t.idempotencyKey),
    index('room_os_workflow_instances_pg_idx').on(t.pgId),
    index('room_os_workflow_instances_booking_idx').on(t.bookingId),
  ],
);

export type RoomOsWorkflowInstanceRow = typeof roomOsWorkflowInstances.$inferSelect;
export type NewRoomOsWorkflowInstanceRow = typeof roomOsWorkflowInstances.$inferInsert;

import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const ROOM_OS_OUTBOX_STATUSES = ['pending', 'processed', 'failed'] as const;
export type RoomOsOutboxStatus = (typeof ROOM_OS_OUTBOX_STATUSES)[number];

/**
 * Transactional outbox for Room OS domain events.
 * Writers append in the same DB transaction as ledger commits (target state).
 */
export const roomOsOutbox = pgTable(
  'room_os_outbox',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    eventId: uuid('event_id').notNull().unique(),
    streamType: text('stream_type').notNull(),
    streamId: uuid('stream_id').notNull(),
    eventType: text('event_type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    rulesEffectivePackId: text('rules_effective_pack_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    sourceRef: text('source_ref').notNull().default(''),
    status: text('status').$type<RoomOsOutboxStatus>().notNull().default('pending'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('room_os_outbox_status_created_idx').on(t.status, t.createdAt),
    index('room_os_outbox_stream_idx').on(t.streamType, t.streamId, t.occurredAt),
    index('room_os_outbox_event_type_idx').on(t.eventType),
  ],
);

export type RoomOsOutboxRow = typeof roomOsOutbox.$inferSelect;
export type NewRoomOsOutboxRow = typeof roomOsOutbox.$inferInsert;

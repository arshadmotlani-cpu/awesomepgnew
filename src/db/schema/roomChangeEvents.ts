import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { roomChangeRequests } from './roomChangeRequests';

export const roomChangeEvents = pgTable(
  'room_change_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    roomChangeRequestId: uuid('room_change_request_id')
      .notNull()
      .references(() => roomChangeRequests.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('room_change_events_idempotency_uidx').on(t.idempotencyKey),
    index('room_change_events_pending_idx').on(t.status, t.nextRetryAt, t.createdAt),
    index('room_change_events_request_idx').on(t.roomChangeRequestId, t.createdAt),
  ],
);

export type RoomChangeEvent = typeof roomChangeEvents.$inferSelect;

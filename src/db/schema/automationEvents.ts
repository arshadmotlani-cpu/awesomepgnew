import { sql } from 'drizzle-orm';
import { index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { bookings } from './bookings';
import { customers } from './customers';
import { pgs } from './pgs';

export const automationEventTypeEnum = pgEnum('automation_event_type', [
  'rent_due',
  'rent_overdue',
  'electricity_due',
  'electricity_overdue',
  'vacating_notice',
  'checkin',
  'checkout',
  'kyc_pending',
  'payment_received',
  'deposit_pending_refund',
  'deposit_collection_due',
  'deposit_collection_overdue',
  'deposit_collection_received',
]);

export const automationEventStatusEnum = pgEnum('automation_event_status', [
  'pending',
  'processed',
  'failed',
]);

export type AutomationEventType = (typeof automationEventTypeEnum.enumValues)[number];

export const automationEvents = pgTable(
  'automation_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    pgId: uuid('pg_id')
      .notNull()
      .references(() => pgs.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    eventType: automationEventTypeEnum('event_type').notNull(),
    triggerDate: timestamp('trigger_date', { withTimezone: true }).notNull(),
    status: automationEventStatusEnum('status').notNull().default('pending'),
    idempotencyKey: text('idempotency_key').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('automation_events_idempotency_key_unique').on(t.idempotencyKey),
    index('automation_events_status_trigger_idx').on(t.status, t.triggerDate),
    index('automation_events_pg_type_idx').on(t.pgId, t.eventType, t.createdAt),
  ],
);

export type AutomationEvent = typeof automationEvents.$inferSelect;
export type NewAutomationEvent = typeof automationEvents.$inferInsert;

import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizationIdCol, locationIdCol, userIdCol } from './tenantColumns';
import { fyhAdminUsers } from './admin';
import { fyhCustomers } from './customers';

export const FYH_TIMELINE_EVENT_TYPES = [
  'customer_created',
  'appointment',
  'bill',
  'membership',
  'package',
  'note',
  'wallet',
  'profile_updated',
  'other',
] as const;
export type FyhTimelineEventType = (typeof FYH_TIMELINE_EVENT_TYPES)[number];

export const fyhCustomerNotes = pgTable(
  'fyh_customer_notes',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => fyhCustomers.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    isAlert: boolean('is_alert').notNull().default(false),
    createdByAdminId: uuid('created_by_admin_id').references(() => fyhAdminUsers.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fyh_customer_notes_customer_idx').on(t.customerId, t.createdAt)],
);

export const fyhCustomerTimeline = pgTable(
  'fyh_customer_timeline',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => fyhCustomers.id, { onDelete: 'cascade' }),
    eventType: text('event_type').$type<FyhTimelineEventType>().notNull(),
    title: text('title').notNull(),
    body: text('body'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fyh_customer_timeline_customer_idx').on(t.customerId, t.occurredAt)],
);

export type FyhCustomerNote = typeof fyhCustomerNotes.$inferSelect;
export type FyhCustomerTimelineEvent = typeof fyhCustomerTimeline.$inferSelect;

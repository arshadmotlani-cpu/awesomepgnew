import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { customers } from './customers';

export const visitorSessions = pgTable(
  'visitor_sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    currentPath: text('current_path'),
    trafficSource: text('traffic_source').notNull().default('direct'),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    deviceType: text('device_type').notNull().default('desktop'),
    country: text('country'),
    state: text('state'),
    city: text('city'),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('visitor_sessions_last_seen_idx').on(t.lastSeenAt),
    index('visitor_sessions_first_seen_idx').on(t.firstSeenAt),
    index('visitor_sessions_traffic_source_idx').on(t.trafficSource),
    index('visitor_sessions_device_type_idx').on(t.deviceType),
    index('visitor_sessions_country_idx').on(t.country),
  ],
);

export type VisitorSession = typeof visitorSessions.$inferSelect;
export type NewVisitorSession = typeof visitorSessions.$inferInsert;

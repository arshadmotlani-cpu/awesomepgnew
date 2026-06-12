import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { visitorSessions } from './visitorSessions';

export type AnalyticsEventType =
  | 'room_viewed'
  | 'bed_selected'
  | 'booking_started'
  | 'payment_completed'
  | 'kyc_submitted'
  | 'check_in_completed';

export const siteAnalyticsEvents = pgTable(
  'site_analytics_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    sessionId: uuid('session_id').references(() => visitorSessions.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('site_analytics_events_type_idx').on(t.eventType, t.createdAt),
    index('site_analytics_events_session_idx').on(t.sessionId),
  ],
);

export type SiteAnalyticsEvent = typeof siteAnalyticsEvents.$inferSelect;
export type NewSiteAnalyticsEvent = typeof siteAnalyticsEvents.$inferInsert;

import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { visitorSessions } from './visitorSessions';

export const sitePageViews = pgTable(
  'site_page_views',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => visitorSessions.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    pageKey: text('page_key').notNull(),
    viewedAt: timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
    durationSeconds: integer('duration_seconds'),
  },
  (t) => [
    index('site_page_views_session_idx').on(t.sessionId, t.viewedAt),
    index('site_page_views_page_key_idx').on(t.pageKey, t.viewedAt),
    index('site_page_views_viewed_at_idx').on(t.viewedAt),
  ],
);

export type SitePageView = typeof sitePageViews.$inferSelect;
export type NewSitePageView = typeof sitePageViews.$inferInsert;

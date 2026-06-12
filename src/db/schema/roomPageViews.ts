import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { rooms } from './rooms';

/** Anonymous + logged-in room page views — one row per deduped visit. */
export const roomPageViews = pgTable(
  'room_page_views',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    /** `c:{customerId}` or hashed anonymous fingerprint. */
    visitorKey: text('visitor_key').notNull(),
    viewedAt: timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('room_page_views_room_viewed_idx').on(t.roomId, t.viewedAt),
    index('room_page_views_room_visitor_idx').on(t.roomId, t.visitorKey, t.viewedAt),
  ],
);

export type RoomPageView = typeof roomPageViews.$inferSelect;
export type NewRoomPageView = typeof roomPageViews.$inferInsert;

import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { beds } from './beds';

/** Distinct visitors who tapped a bed in notice — real interest, one row per person per bed. */
export const bedNoticeInterest = pgTable(
  'bed_notice_interest',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    bedId: uuid('bed_id')
      .notNull()
      .references(() => beds.id, { onDelete: 'cascade' }),
    visitorKey: text('visitor_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('bed_notice_interest_bed_visitor_unique').on(t.bedId, t.visitorKey),
    index('bed_notice_interest_bed_idx').on(t.bedId),
  ],
);

export type BedNoticeInterest = typeof bedNoticeInterest.$inferSelect;

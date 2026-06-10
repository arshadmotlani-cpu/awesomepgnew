import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { bedStatusEnum } from './enums';
import { rooms } from './rooms';

export const beds = pgTable(
  'beds',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'restrict' }),
    bedCode: text('bed_code').notNull(),
    status: bedStatusEnum('status').notNull().default('available'),
    notes: text('notes'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('beds_room_id_bed_code_unique').on(t.roomId, t.bedCode),
  ],
);

export type Bed = typeof beds.$inferSelect;
export type NewBed = typeof beds.$inferInsert;

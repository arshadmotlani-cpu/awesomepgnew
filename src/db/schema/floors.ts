import { sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pgs } from './pgs';

export const floors = pgTable(
  'floors',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    pgId: uuid('pg_id')
      .notNull()
      .references(() => pgs.id, { onDelete: 'restrict' }),
    floorNumber: integer('floor_number').notNull(),
    label: text('label'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('floors_pg_id_floor_number_unique').on(t.pgId, t.floorNumber),
  ],
);

export type Floor = typeof floors.$inferSelect;
export type NewFloor = typeof floors.$inferInsert;

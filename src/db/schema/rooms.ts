import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { floors } from './floors';
import { roomTypes } from './roomTypes';

export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    floorId: uuid('floor_id')
      .notNull()
      .references(() => floors.id, { onDelete: 'restrict' }),
    roomTypeId: uuid('room_type_id')
      .notNull()
      .references(() => roomTypes.id, { onDelete: 'restrict' }),
    roomNumber: text('room_number').notNull(),
    notes: text('notes'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('rooms_floor_id_room_number_unique').on(t.floorId, t.roomNumber),
  ],
);

export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;

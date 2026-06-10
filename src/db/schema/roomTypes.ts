import { sql } from 'drizzle-orm';
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { pgs } from './pgs';

export type RoomTypeAmenities = {
  attachedKitchenette?: boolean;
  balcony?: boolean;
  studyTable?: boolean;
  wardrobe?: boolean;
  [key: string]: unknown;
};

export const roomTypes = pgTable('room_types', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  // null pgId == a global template; non-null == PG-specific.
  pgId: uuid('pg_id').references(() => pgs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  defaultCapacity: integer('default_capacity').notNull(),
  hasAc: boolean('has_ac').notNull().default(false),
  hasAttachedBath: boolean('has_attached_bath').notNull().default(false),
  defaultAmenities: jsonb('default_amenities').$type<RoomTypeAmenities>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type RoomType = typeof roomTypes.$inferSelect;
export type NewRoomType = typeof roomTypes.$inferInsert;

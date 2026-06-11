import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { bookings } from './bookings';
import { meterReadingTypeEnum, meterRecordedByEnum } from './enums';
import { pgs } from './pgs';
import { rooms } from './rooms';

export const meterLogs = pgTable('meter_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  pgId: uuid('pg_id')
    .notNull()
    .references(() => pgs.id, { onDelete: 'cascade' }),
  roomId: uuid('room_id')
    .notNull()
    .references(() => rooms.id, { onDelete: 'cascade' }),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
  readingType: meterReadingTypeEnum('reading_type').notNull(),
  meterImageUrl: text('meter_image_url'),
  units: numeric('units', { precision: 10, scale: 2 }).notNull(),
  recordedBy: meterRecordedByEnum('recorded_by').notNull().default('admin'),
  recordedById: uuid('recorded_by_id'),
  isEstimated: boolean('is_estimated').notNull().default(false),
  recordedAt: date('recorded_at').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type MeterLog = typeof meterLogs.$inferSelect;
export type NewMeterLog = typeof meterLogs.$inferInsert;

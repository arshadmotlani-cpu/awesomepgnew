import { pgEnum, pgTable, text, timestamp, uuid, bigint, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { bookings } from './bookings';
import { customers } from './customers';
import { beds } from './beds';
import { adminUsers } from './adminUsers';

export const roomChangeStatusEnum = pgEnum('room_change_status', [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'completed',
  'cancelled',
]);

export const roomChangeRequests = pgTable(
  'room_change_requests',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    fromBedId: uuid('from_bed_id')
      .notNull()
      .references(() => beds.id, { onDelete: 'restrict' }),
    toBedId: uuid('to_bed_id')
      .notNull()
      .references(() => beds.id, { onDelete: 'restrict' }),
    requestedShiftDate: text('requested_shift_date').notNull(),
    quoteSnapshot: jsonb('quote_snapshot').notNull(),
    status: roomChangeStatusEnum('status').notNull().default('submitted'),
    adminNotes: text('admin_notes'),
    reviewedByAdminId: uuid('reviewed_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('room_change_requests_booking_idx').on(t.bookingId),
    index('room_change_requests_status_idx').on(t.status),
  ],
);

export type RoomChangeRequest = typeof roomChangeRequests.$inferSelect;
export type NewRoomChangeRequest = typeof roomChangeRequests.$inferInsert;

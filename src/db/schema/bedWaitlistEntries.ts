import { sql } from 'drizzle-orm';
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { beds } from './beds';
import { bookings } from './bookings';
import { customers } from './customers';
import { roomChangeRequests } from './roomChangeRequests';

export const bedWaitlistEntries = pgTable(
  'bed_waitlist_entries',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    bedId: uuid('bed_id')
      .notNull()
      .references(() => beds.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    roomChangeRequestId: uuid('room_change_request_id').references(
      () => roomChangeRequests.id,
      { onDelete: 'set null' },
    ),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('bed_waitlist_entries_active_bed_customer_uidx')
      .on(t.bedId, t.customerId)
      .where(sql`${t.status} = 'active'`),
    index('bed_waitlist_entries_bed_status_idx').on(t.bedId, t.status),
  ],
);

export type BedWaitlistEntry = typeof bedWaitlistEntries.$inferSelect;

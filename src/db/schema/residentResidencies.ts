import { sql } from 'drizzle-orm';
import { date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { beds } from './beds';
import { bookings } from './bookings';
import { customers } from './customers';
import { pgs } from './pgs';
import { residencyLifecycleEnum } from './enums';

export const residentResidencies = pgTable(
  'resident_residencies',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    pgId: uuid('pg_id')
      .notNull()
      .references(() => pgs.id, { onDelete: 'restrict' }),
    lifecycle: residencyLifecycleEnum('lifecycle').notNull().default('active'),
    startedAt: date('started_at').notNull(),
    expectedMoveOut: date('expected_move_out'),
    endedAt: date('ended_at'),
    currentBookingId: uuid('current_booking_id').references(() => bookings.id, {
      onDelete: 'set null',
    }),
    currentBedId: uuid('current_bed_id').references(() => beds.id, { onDelete: 'set null' }),
    /** Booking that owns deposit ledger for this residency (usually first in chain). */
    depositBookingId: uuid('deposit_booking_id').references(() => bookings.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('resident_residencies_customer_idx').on(t.customerId),
    index('resident_residencies_pg_idx').on(t.pgId, t.lifecycle),
    index('resident_residencies_current_booking_idx').on(t.currentBookingId),
    uniqueIndex('resident_residencies_one_open_per_customer')
      .on(t.customerId)
      .where(sql`${t.lifecycle} IN ('onboarding', 'active', 'vacating', 'checkout')`),
  ],
);

export const residencyBookingLinks = pgTable(
  'residency_booking_links',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    residencyId: uuid('residency_id')
      .notNull()
      .references(() => residentResidencies.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    sequenceNo: integer('sequence_no').notNull().default(1),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('residency_booking_links_residency_idx').on(t.residencyId, t.sequenceNo),
    uniqueIndex('residency_booking_links_residency_booking_unique').on(
      t.residencyId,
      t.bookingId,
    ),
    uniqueIndex('residency_booking_links_booking_unique').on(t.bookingId),
  ],
);

export type ResidentResidency = typeof residentResidencies.$inferSelect;
export type ResidencyBookingLink = typeof residencyBookingLinks.$inferSelect;

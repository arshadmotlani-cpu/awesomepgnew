import { sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  index,
  pgTable,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { beds } from './beds';
import { bookings } from './bookings';
import { daterange } from './customTypes';
import { reservationKindEnum, reservationStatusEnum } from './enums';

/**
 * One row == one bed held for one date range. The GiST EXCLUDE constraint
 * added in the constraints migration is what makes overlap prevention
 * race-proof at the storage layer.
 *
 * `stay_range` is always stored as the half-open daterange [check_in, check_out).
 */
export const bedReservations = pgTable(
  'bed_reservations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    bedId: uuid('bed_id')
      .notNull()
      .references(() => beds.id, { onDelete: 'restrict' }),
    stayRange: daterange('stay_range').notNull(),
    kind: reservationKindEnum('kind').notNull().default('primary'),
    parentReservationId: uuid('parent_reservation_id').references(
      (): AnyPgColumn => bedReservations.id,
      { onDelete: 'set null' },
    ),
    status: reservationStatusEnum('status').notNull().default('hold'),
    holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bed_reservations_booking_id_idx').on(t.bookingId),
    index('bed_reservations_bed_id_idx').on(t.bedId),
    index('bed_reservations_status_idx').on(t.status),
    // Partial index used by the hold-expiry sweeper to cheaply find expired holds.
    index('bed_reservations_hold_expiry_idx')
      .on(t.holdExpiresAt)
      .where(sql`status = 'hold'`),
  ],
);

export type BedReservation = typeof bedReservations.$inferSelect;
export type NewBedReservation = typeof bedReservations.$inferInsert;

import { sql } from 'drizzle-orm';
import { bigint, date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { bookings } from './bookings';
import {
  extensionDurationModeEnum,
  extensionRequestedByEnum,
  extensionStatusEnum,
} from './enums';
import { payments } from './payments';

/**
 * Audit + workflow log for stay extensions. The actual new inventory rows
 * live in `bed_reservations` with `kind = 'extension'`; this table tracks the
 * request, quote, and approval lifecycle.
 */
export const stayExtensions = pgTable(
  'stay_extensions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    requestedBy: extensionRequestedByEnum('requested_by').notNull(),
    requestedUntilDate: date('requested_until_date').notNull(),
    extensionDurationMode: extensionDurationModeEnum('extension_duration_mode').notNull(),
    quotedTotalPaise: bigint('quoted_total_paise', { mode: 'number' }).notNull(),
    status: extensionStatusEnum('status').notNull().default('pending'),
    paymentProofUrl: text('payment_proof_url'),
    paymentProofTransactionRef: text('payment_proof_transaction_ref'),
    newReservationIds: uuid('new_reservation_ids').array().notNull().default(sql`'{}'::uuid[]`),
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('stay_extensions_booking_id_idx').on(t.bookingId),
    index('stay_extensions_status_idx').on(t.status),
  ],
);

export type StayExtension = typeof stayExtensions.$inferSelect;
export type NewStayExtension = typeof stayExtensions.$inferInsert;

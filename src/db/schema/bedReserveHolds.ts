import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
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
import { bedReserveStatusEnum } from './enums';

export const bedReserveHolds = pgTable(
  'bed_reserve_holds',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    reserveCode: text('reserve_code').notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    bedId: uuid('bed_id')
      .notNull()
      .references(() => beds.id, { onDelete: 'restrict' }),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    reserveStart: date('reserve_start').notNull(),
    checkInDate: date('check_in_date').notNull(),
    status: bedReserveStatusEnum('status').notNull().default('pending_payment'),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    monthlyRateSnapshotPaise: bigint('monthly_rate_snapshot_paise', {
      mode: 'number',
    }).notNull(),
    paymentProofUrl: text('payment_proof_url'),
    transactionRef: text('transaction_ref'),
    holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('bed_reserve_holds_reserve_code_unique').on(t.reserveCode),
    index('bed_reserve_holds_bed_id_idx').on(t.bedId),
    index('bed_reserve_holds_customer_id_idx').on(t.customerId),
    index('bed_reserve_holds_status_idx').on(t.status),
  ],
);

export type BedReserveHold = typeof bedReserveHolds.$inferSelect;
export type NewBedReserveHold = typeof bedReserveHolds.$inferInsert;

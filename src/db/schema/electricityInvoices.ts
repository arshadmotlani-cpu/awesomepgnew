import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { beds } from './beds';
import { bookings } from './bookings';
import { customers } from './customers';
import { electricityBills } from './electricityBills';
import { electricityInvoiceStatusEnum } from './enums';
import { payments } from './payments';
import { rooms } from './rooms';

/**
 * Per-resident slice of an electricity bill. One row per
 * (electricity_bill, booking).
 *
 * `due_date` is set to `bill.createdAt + 3 days` at fan-out time (per the
 * Phase 5.5 spec: 3-day grace + 1%/day penalty on outstanding amount).
 * The penalty is *projected* on read from `due_date` + `amount_paise`,
 * and frozen into `late_fee_locked_paise` at payment time so a paid
 * invoice always renders a stable number regardless of "today".
 *
 * Cancelled invoices skip the late-fee logic entirely.
 */
export const electricityInvoices = pgTable(
  'electricity_invoices',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    invoiceNumber: text('invoice_number').notNull(),
    electricityBillId: uuid('electricity_bill_id')
      .notNull()
      .references(() => electricityBills.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'restrict' }),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    bedId: uuid('bed_id')
      .notNull()
      .references(() => beds.id, { onDelete: 'restrict' }),
    billingMonth: date('billing_month').notNull(),
    dueDate: date('due_date').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    paidPaise: bigint('paid_paise', { mode: 'number' }).notNull().default(0),
    lateFeeLockedPaise: bigint('late_fee_locked_paise', { mode: 'number' }),
    status: electricityInvoiceStatusEnum('status').notNull().default('pending'),
    paymentId: uuid('payment_id').references(() => payments.id, {
      onDelete: 'set null',
    }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    paymentProofUrl: text('payment_proof_url'),
    unitsShare: numeric('units_share', { precision: 10, scale: 2 }),
    activeDays: integer('active_days'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    supersededByInvoiceId: uuid('superseded_by_invoice_id'),
    duplicateDetectedAt: timestamp('duplicate_detected_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('electricity_invoices_invoice_number_unique').on(t.invoiceNumber),
    uniqueIndex('electricity_invoices_bill_booking_unique').on(
      t.electricityBillId,
      t.bookingId,
    ),
    index('electricity_invoices_booking_idx').on(t.bookingId),
    index('electricity_invoices_customer_idx').on(t.customerId),
    index('electricity_invoices_status_idx').on(t.status),
    index('electricity_invoices_bill_idx').on(t.electricityBillId),
    index('electricity_invoices_room_month_customer_idx').on(
      t.roomId,
      t.billingMonth,
      t.customerId,
    ),
    uniqueIndex('electricity_invoices_room_month_customer_active_unique')
      .on(t.roomId, t.billingMonth, t.customerId)
      .where(sql`${t.status} <> 'cancelled' AND ${t.supersededByInvoiceId} IS NULL`),
  ],
);

export type ElectricityInvoice = typeof electricityInvoices.$inferSelect;
export type NewElectricityInvoice = typeof electricityInvoices.$inferInsert;

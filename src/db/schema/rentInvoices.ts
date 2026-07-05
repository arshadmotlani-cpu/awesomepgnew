import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
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
import { pgs } from './pgs';
import { payments } from './payments';
import { rentInvoiceStatusEnum } from './enums';

/**
 * Monthly rent invoice for a single (booking, billing_month) pair.
 *
 * - `billing_month` is always the 1st of the month (DB-enforced via CHECK).
 * - `due_date` is the 5th of the month — late fees kick in on the 6th
 *   at 1% of `rent_paise` per day, accrued linearly (NOT compounded).
 * - The late fee is computed dynamically from `(today - due_date)` while
 *   the invoice is unpaid; on payment, the accrued late fee is frozen
 *   into `late_fee_locked_paise` so the customer + admin ledger never
 *   moves after the payment lands.
 */
export const rentInvoices = pgTable(
  'rent_invoices',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    invoiceNumber: text('invoice_number').notNull(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    bedId: uuid('bed_id')
      .notNull()
      .references(() => beds.id, { onDelete: 'restrict' }),
    pgId: uuid('pg_id')
      .notNull()
      .references(() => pgs.id, { onDelete: 'restrict' }),
    billingMonth: date('billing_month').notNull(),
    dueDate: date('due_date').notNull(),
    rentPaise: bigint('rent_paise', { mode: 'number' }).notNull(),
    discountPaise: bigint('discount_paise', { mode: 'number' }).notNull().default(0),
    promoCode: text('promo_code'),
    paidPrincipalPaise: bigint('paid_principal_paise', { mode: 'number' })
      .notNull()
      .default(0),
    paidLateFeePaise: bigint('paid_late_fee_paise', { mode: 'number' })
      .notNull()
      .default(0),
    /** Late fee snapshotted at the moment the payment landed. Null while unpaid. */
    lateFeeLockedPaise: bigint('late_fee_locked_paise', { mode: 'number' }),
    status: rentInvoiceStatusEnum('status').notNull().default('pending'),
    paymentProofUrl: text('payment_proof_url'),
    paymentId: uuid('payment_id').references(() => payments.id, {
      onDelete: 'set null',
    }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
    notes: text('notes'),
    isAdhoc: boolean('is_adhoc').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('rent_invoices_invoice_number_unique').on(t.invoiceNumber),
    uniqueIndex('rent_invoices_booking_month_unique')
      .on(t.bookingId, t.billingMonth)
      .where(sql`${t.isAdhoc} = false`),
    index('rent_invoices_booking_idx').on(t.bookingId),
    index('rent_invoices_customer_idx').on(t.customerId),
    index('rent_invoices_status_idx').on(t.status),
    index('rent_invoices_pg_month_idx').on(t.pgId, t.billingMonth),
  ],
);

export type RentInvoice = typeof rentInvoices.$inferSelect;
export type NewRentInvoice = typeof rentInvoices.$inferInsert;

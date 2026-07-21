import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';
import { bookings } from './bookings';
import { customers } from './customers';
import { electricityInvoices } from './electricityInvoices';
import { payments } from './payments';
import { rentInvoices } from './rentInvoices';

export const residentCreditEntryKindEnum = pgEnum('resident_credit_entry_kind', [
  'credit',
  'debit',
  'applied',
]);

/**
 * Append-only resident credit balance — separate from deposit escrow.
 * Running balance = sum(amount_paise) per customer_id.
 */
export const residentCreditLedger = pgTable(
  'resident_credit_ledger',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    entryKind: residentCreditEntryKindEnum('entry_kind').notNull(),
    /** Signed paise — credit > 0, debit/applied < 0. */
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    reason: text('reason').notNull(),
    relatedRentInvoiceId: uuid('related_rent_invoice_id').references(() => rentInvoices.id, {
      onDelete: 'set null',
    }),
    relatedElectricityInvoiceId: uuid('related_electricity_invoice_id').references(
      () => electricityInvoices.id,
      { onDelete: 'set null' },
    ),
    relatedPaymentId: uuid('related_payment_id').references(() => payments.id, {
      onDelete: 'set null',
    }),
    createdByAdminId: uuid('created_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('resident_credit_ledger_customer_idx').on(t.customerId),
    index('resident_credit_ledger_booking_idx').on(t.bookingId),
  ],
);

export type ResidentCreditLedgerEntry = typeof residentCreditLedger.$inferSelect;
export type NewResidentCreditLedgerEntry = typeof residentCreditLedger.$inferInsert;

import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';
import { bookings } from './bookings';
import { customers } from './customers';
import { depositEntryKindEnum } from './enums';
import { payments } from './payments';

/**
 * Append-only ledger of deposit movements per booking.
 *
 *   - `collected`: positive amount, written when the booking's deposit
 *     payment lands (Phase 4 hook). Mirrors `bookings.deposit_paise`
 *     into the ledger so the sum query is uniform.
 *   - `deducted`:  negative amount, written on vacating-with-penalty or
 *     by an admin "record deduction" form (damages, unpaid invoices etc).
 *   - `refunded`:  negative amount, written when the operator returns
 *     the balance.
 *
 * The signed-amount CHECK constraint at the DB level is the authority —
 * a buggy service can't write `collected` with a negative or `deducted`
 * with a positive and silently corrupt the running balance.
 *
 * The running balance is therefore `sum(amount_paise) WHERE booking_id = $1`.
 */
export const depositLedger = pgTable(
  'deposit_ledger',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    entryKind: depositEntryKindEnum('entry_kind').notNull(),
    /** Signed paise — collected > 0, deducted/refunded < 0. */
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    reason: text('reason').notNull(),
    relatedPaymentId: uuid('related_payment_id').references(() => payments.id, {
      onDelete: 'set null',
    }),
    /**
     * Loose-typed UUID — the FK to vacating_requests is created in the
     * migration AFTER both tables exist (see 0004_phase5_5_resident_billing.sql).
     */
    relatedVacatingId: uuid('related_vacating_id'),
    createdByAdminId: uuid('created_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('deposit_ledger_booking_idx').on(t.bookingId),
    index('deposit_ledger_customer_idx').on(t.customerId),
    index('deposit_ledger_kind_idx').on(t.entryKind),
  ],
);

export type DepositLedgerEntry = typeof depositLedger.$inferSelect;
export type NewDepositLedgerEntry = typeof depositLedger.$inferInsert;

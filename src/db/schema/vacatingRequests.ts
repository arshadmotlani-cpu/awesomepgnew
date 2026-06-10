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
import { adminUsers } from './adminUsers';
import { bookings } from './bookings';
import { customers } from './customers';
import { vacatingStatusEnum } from './enums';

/**
 * Vacating workflow for monthly residents.
 *
 * The 5-day rent penalty is computed at submit time from
 * `monthly_rent_paise_snapshot` (daily rate = monthly / 30, penalty =
 * daily * 5) and stored on the row so a later rent-rate change can't
 * silently rewrite the deduction for past requests.
 *
 * Status transitions:
 *   pending   → approved (admin acknowledges; deposit not yet touched)
 *   pending   → rejected (admin denies)
 *   approved  → completed (admin marks request done; writes the
 *                deposit_ledger entries + cancels future invoices)
 *   pending   → completed (admin can skip approval and complete in one go)
 *   *         → rejected/cancelled — late changes allowed pre-completion
 *
 * UNIQUE (booking_id) means only ONE outstanding request per booking;
 * once a request is `completed` or `rejected` the operator must
 * explicitly delete it before another can be filed (rare edge case —
 * mostly the booking is `completed` by that point).
 */
export const vacatingRequests = pgTable(
  'vacating_requests',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    noticeGivenDate: date('notice_given_date').notNull(),
    vacatingDate: date('vacating_date').notNull(),
    noticeCompliant: boolean('notice_compliant').notNull(),
    deductionPaise: bigint('deduction_paise', { mode: 'number' })
      .notNull()
      .default(0),
    depositRefundPaise: bigint('deposit_refund_paise', { mode: 'number' })
      .notNull()
      .default(0),
    monthlyRentPaiseSnapshot: bigint('monthly_rent_paise_snapshot', {
      mode: 'number',
    }).notNull(),
    status: vacatingStatusEnum('status').notNull().default('pending'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedByAdminId: uuid('resolved_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('vacating_requests_one_open_per_booking').on(t.bookingId),
    index('vacating_requests_booking_idx').on(t.bookingId),
    index('vacating_requests_status_idx').on(t.status),
  ],
);

export type VacatingRequest = typeof vacatingRequests.$inferSelect;
export type NewVacatingRequest = typeof vacatingRequests.$inferInsert;

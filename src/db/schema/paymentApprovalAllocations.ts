import { sql } from 'drizzle-orm';
import {
  bigint,
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
import { pgs } from './pgs';

/** Snapshot of how an approved payment proof was allocated (rent vs deposit). */
export const paymentApprovalAllocations = pgTable(
  'payment_approval_allocations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id').references(() => customers.id, {
      onDelete: 'set null',
    }),
    pgId: uuid('pg_id').references(() => pgs.id, { onDelete: 'set null' }),
    roomChargesPaidPaise: bigint('room_charges_paid_paise', { mode: 'number' })
      .notNull()
      .default(0),
    securityDepositPaidPaise: bigint('security_deposit_paid_paise', { mode: 'number' })
      .notNull()
      .default(0),
    priorOutstandingPaidPaise: bigint('prior_outstanding_paid_paise', { mode: 'number' })
      .notNull()
      .default(0),
    totalAmountReceivedPaise: bigint('total_amount_received_paise', { mode: 'number' }).notNull(),
    totalExpectedPaise: bigint('total_expected_paise', { mode: 'number' }).notNull().default(0),
    paymentCategory: text('payment_category').notNull(),
    approvedByAdminId: uuid('approved_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('payment_approval_allocations_entity_uidx').on(t.entityType, t.entityId),
    index('payment_approval_allocations_booking_idx').on(t.bookingId),
    index('payment_approval_allocations_approved_at_idx').on(t.approvedAt),
  ],
);

export type PaymentApprovalAllocation = typeof paymentApprovalAllocations.$inferSelect;
export type NewPaymentApprovalAllocation = typeof paymentApprovalAllocations.$inferInsert;

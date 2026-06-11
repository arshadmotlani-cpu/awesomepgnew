import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { bookings } from './bookings';
import { customers } from './customers';
import {
  playstationMembershipPlanEnum,
  playstationMembershipStatusEnum,
} from './enums';
import { pgs } from './pgs';

export const playstationMemberships = pgTable(
  'playstation_memberships',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    pgId: uuid('pg_id')
      .notNull()
      .references(() => pgs.id, { onDelete: 'restrict' }),
    /** Set when purchased during booking checkout — separate from booking pricing. */
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    plan: playstationMembershipPlanEnum('plan').notNull(),
    status: playstationMembershipStatusEnum('status').notNull().default('pending_payment'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    paymentProofUrl: text('payment_proof_url'),
    transactionRef: text('transaction_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('playstation_memberships_customer_id_idx').on(t.customerId),
    index('playstation_memberships_status_idx').on(t.status),
    index('playstation_memberships_booking_id_idx').on(t.bookingId),
  ],
);

export type PlaystationMembership = typeof playstationMemberships.$inferSelect;
export type NewPlaystationMembership = typeof playstationMemberships.$inferInsert;

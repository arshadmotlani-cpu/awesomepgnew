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
import { adminUsers } from './adminUsers';
import { bookings } from './bookings';
import { checkoutSettlements } from './checkoutSettlements';
import { customers } from './customers';
import { rooms } from './rooms';

/** Pre-distribution electricity payments — historical offline or checkout deposit recovery. */
export const electricityRoomContributions = pgTable(
  'electricity_room_contributions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'restrict' }),
    billingMonth: date('billing_month').notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    kind: text('kind').notNull().$type<'historical' | 'checkout_recovery'>(),
    reason: text('reason'),
    contributionDate: date('contribution_date').notNull(),
    checkoutSettlementId: uuid('checkout_settlement_id').references(() => checkoutSettlements.id, {
      onDelete: 'restrict',
    }),
    createdByAdminId: uuid('created_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('electricity_room_contributions_checkout_unique')
      .on(t.checkoutSettlementId)
      .where(sql`${t.checkoutSettlementId} IS NOT NULL`),
    index('electricity_room_contributions_room_month_idx').on(t.roomId, t.billingMonth),
    index('electricity_room_contributions_booking_idx').on(t.bookingId),
  ],
);

export type ElectricityRoomContribution = typeof electricityRoomContributions.$inferSelect;
export type ElectricityRoomContributionKind = ElectricityRoomContribution['kind'];

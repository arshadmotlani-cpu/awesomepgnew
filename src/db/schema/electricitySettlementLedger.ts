import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { bookings } from './bookings';
import { checkoutSettlements } from './checkoutSettlements';
import { customers } from './customers';
import { electricityBills } from './electricityBills';
import { rooms } from './rooms';

/** Permanent record of electricity collected from a resident at checkout. */
export const electricitySettlementLedger = pgTable(
  'electricity_settlement_ledger',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    checkoutSettlementId: uuid('checkout_settlement_id')
      .notNull()
      .references(() => checkoutSettlements.id, { onDelete: 'restrict' }),
    billingMonth: date('billing_month').notNull(),
    stayPeriodStart: date('stay_period_start'),
    stayPeriodEnd: date('stay_period_end'),
    units: numeric('units', { precision: 12, scale: 2 }),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    /** `collected` at checkout approval; `applied` when consumed on a monthly room bill. */
    status: text('status').notNull().default('collected'),
    electricityBillId: uuid('electricity_bill_id').references(() => electricityBills.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('electricity_settlement_ledger_settlement_unique').on(t.checkoutSettlementId),
    index('electricity_settlement_ledger_room_month_idx').on(t.roomId, t.billingMonth, t.status),
  ],
);

export type ElectricitySettlementLedgerEntry = typeof electricitySettlementLedger.$inferSelect;
export type NewElectricitySettlementLedgerEntry =
  typeof electricitySettlementLedger.$inferInsert;

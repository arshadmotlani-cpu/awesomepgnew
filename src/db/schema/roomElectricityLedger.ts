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
import { bookings } from './bookings';
import { checkoutSettlements } from './checkoutSettlements';
import { customers } from './customers';
import { electricityInvoices } from './electricityInvoices';
import { rooms } from './rooms';

/** Per-room per-month electricity cycle — collected + remaining must equal total bill. */
export const roomElectricityLedgerCycles = pgTable(
  'room_electricity_ledger_cycles',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'restrict' }),
    billingMonth: date('billing_month').notNull(),
    totalBillPaise: bigint('total_bill_paise', { mode: 'number' }).notNull().default(0),
    collectedPaise: bigint('collected_paise', { mode: 'number' }).notNull().default(0),
    remainingPaise: bigint('remaining_paise', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('room_electricity_ledger_cycles_room_month_unique').on(t.roomId, t.billingMonth),
    index('room_electricity_ledger_cycles_room_idx').on(t.roomId),
  ],
);

export const roomElectricityLedgerEntries = pgTable(
  'room_electricity_ledger_entries',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    cycleId: uuid('cycle_id')
      .notNull()
      .references(() => roomElectricityLedgerCycles.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    /** checkout_settlement | manual | cash | upi | monthly_invoice | adjustment */
    source: text('source').notNull(),
    checkoutSettlementId: uuid('checkout_settlement_id').references(() => checkoutSettlements.id, {
      onDelete: 'restrict',
    }),
    electricityInvoiceId: uuid('electricity_invoice_id').references(() => electricityInvoices.id, {
      onDelete: 'restrict',
    }),
    note: text('note'),
    collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('room_electricity_ledger_entries_checkout_unique').on(t.checkoutSettlementId),
    uniqueIndex('room_electricity_ledger_entries_invoice_unique').on(t.electricityInvoiceId),
    index('room_electricity_ledger_entries_cycle_idx').on(t.cycleId),
  ],
);

export type RoomElectricityLedgerCycle = typeof roomElectricityLedgerCycles.$inferSelect;
export type RoomElectricityLedgerEntry = typeof roomElectricityLedgerEntries.$inferSelect;

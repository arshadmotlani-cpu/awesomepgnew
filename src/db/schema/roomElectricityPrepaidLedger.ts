import { sql } from 'drizzle-orm';
import { bigint, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';
import { electricityBills } from './electricityBills';
import { rooms } from './rooms';

export const roomElectricityPrepaidLedger = pgTable(
  'room_electricity_prepaid_ledger',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    /** `added` — offline payment recorded; `applied` — consumed on a bill. */
    entryKind: text('entry_kind').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    paidByNote: text('paid_by_note'),
    electricityBillId: uuid('electricity_bill_id').references(() => electricityBills.id, {
      onDelete: 'set null',
    }),
    createdByAdminId: uuid('created_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('room_electricity_prepaid_ledger_room_idx').on(t.roomId, t.createdAt)],
);

export type RoomElectricityPrepaidLedgerEntry =
  typeof roomElectricityPrepaidLedger.$inferSelect;

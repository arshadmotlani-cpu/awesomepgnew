import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';
import { bookings } from './bookings';
import { customers } from './customers';
import { depositLedger } from './depositLedger';
import type { RefundDeductionsSnapshot } from './residentRequests';

export const depositSettlements = pgTable(
  'deposit_settlements',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    idempotencyKey: text('idempotency_key').notNull(),
    source: text('source').notNull(),
    sourceId: uuid('source_id'),
    finalRefundPaise: bigint('final_refund_paise', { mode: 'number' }).notNull(),
    deductionsSnapshot: jsonb('deductions_snapshot').$type<RefundDeductionsSnapshot>(),
    refundMethod: text('refund_method'),
    refundReference: text('refund_reference'),
    refundProofUrl: text('refund_proof_url'),
    refundedByAdminId: uuid('refunded_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }).notNull().defaultNow(),
    ledgerEntryId: uuid('ledger_entry_id').references(() => depositLedger.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('deposit_settlements_idempotency_unique').on(t.idempotencyKey),
    index('deposit_settlements_booking_idx').on(t.bookingId, t.createdAt),
  ],
);

export type DepositSettlement = typeof depositSettlements.$inferSelect;
export type NewDepositSettlement = typeof depositSettlements.$inferInsert;

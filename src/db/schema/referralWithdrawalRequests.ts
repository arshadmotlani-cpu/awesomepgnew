/**
 * Referral earnings withdrawal requests — separate from deposit refund workflow.
 */
import { bigint, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { customers } from './customers';
import { referralWithdrawalStatusEnum } from './enums';

export const referralWithdrawalRequests = pgTable(
  'referral_withdrawal_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    status: referralWithdrawalStatusEnum('status').notNull().default('pending'),
    upiId: text('upi_id'),
    adminNotes: text('admin_notes'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('referral_withdrawal_customer_idx').on(t.customerId),
    index('referral_withdrawal_status_idx').on(t.status),
  ],
);

export type ReferralWithdrawalRequest = typeof referralWithdrawalRequests.$inferSelect;

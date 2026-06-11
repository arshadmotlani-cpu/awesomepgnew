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
import { membershipTransactionKindEnum, playstationMembershipPlanEnum } from './enums';
import { playstationMemberships } from './playstationMemberships';

export const membershipTransactions = pgTable(
  'membership_transactions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => playstationMemberships.id, { onDelete: 'cascade' }),
    kind: membershipTransactionKindEnum('kind').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull().default(0),
    fromPlan: playstationMembershipPlanEnum('from_plan'),
    toPlan: playstationMembershipPlanEnum('to_plan'),
    notes: text('notes'),
    adminId: uuid('admin_id').references(() => adminUsers.id, { onDelete: 'set null' }),
    paymentProofUrl: text('payment_proof_url'),
    transactionRef: text('transaction_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('membership_transactions_membership_id_idx').on(t.membershipId)],
);

export type MembershipTransaction = typeof membershipTransactions.$inferSelect;
export type NewMembershipTransaction = typeof membershipTransactions.$inferInsert;

import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Cross-kind unique guarantee for approved UPI transaction IDs.
 * Written only on approve; two pendings with the same ref are allowed.
 */
export const pgApprovedTransactionRefs = pgTable('pg_approved_transaction_refs', {
  transactionRefNormalized: text('transaction_ref_normalized').primaryKey(),
  sourceKind: text('source_kind').notNull(),
  sourceId: uuid('source_id').notNull(),
  approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
  approvedByAdminId: uuid('approved_by_admin_id'),
});

export type PgApprovedTransactionRef = typeof pgApprovedTransactionRefs.$inferSelect;
export type NewPgApprovedTransactionRef = typeof pgApprovedTransactionRefs.$inferInsert;

export const PG_APPROVED_TXN_SOURCE_KINDS = [
  'pg_payment_record',
  'rent_invoice',
  'electricity_invoice',
  'stay_extension',
  'payment_link',
  'playstation_membership',
] as const;

export type PgApprovedTxnSourceKind = (typeof PG_APPROVED_TXN_SOURCE_KINDS)[number];

void sql;

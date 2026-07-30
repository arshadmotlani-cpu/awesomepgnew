import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { fyhCustomers } from './customers';
import { fyhInvoices } from './billing';
import type {
  FinancialLedgerEntryDraft,
  LedgerAccount,
  LedgerKind,
} from '@/src/hair/domain/ledger/types';

export const fyhFinancialLedger = pgTable(
  'fyh_financial_ledger',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => fyhCustomers.id, { onDelete: 'restrict' }),
    invoiceId: uuid('invoice_id').references(() => fyhInvoices.id, { onDelete: 'set null' }),
    account: text('account').$type<LedgerAccount>().notNull(),
    direction: text('direction').$type<'debit' | 'credit'>().notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    method: text('method').$type<'cash' | 'upi' | 'card' | null>(),
    kind: text('kind').$type<LedgerKind>().notNull(),
    reference: text('reference'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_financial_ledger_customer_idx').on(t.customerId),
    index('fyh_financial_ledger_invoice_idx').on(t.invoiceId),
    index('fyh_financial_ledger_kind_idx').on(t.kind),
  ],
);

export type FyhFinancialLedgerInsert = typeof fyhFinancialLedger.$inferInsert;
export type { FinancialLedgerEntryDraft };

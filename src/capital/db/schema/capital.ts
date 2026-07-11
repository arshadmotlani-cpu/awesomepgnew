import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { paymentModeEnum } from './enums';

export const acCapitalInvestments = pgTable('ac_capital_investments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  investedAt: date('invested_at').notNull(),
  amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
  paymentMode: paymentModeEnum('payment_mode').notNull(),
  referenceNumber: text('reference_number'),
  notes: text('notes'),
  isReversed: boolean('is_reversed').notNull().default(false),
  reversalOfId: uuid('reversal_of_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

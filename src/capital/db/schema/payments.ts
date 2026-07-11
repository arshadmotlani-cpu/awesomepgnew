import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { acAssets } from './assets';
import { paymentModeEnum, paymentTypeEnum } from './enums';

export const acPaymentsReceived = pgTable(
  'ac_payments_received',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    assetId: uuid('asset_id').references(() => acAssets.id, { onDelete: 'restrict' }),
    receivedAt: date('received_at').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    paymentType: paymentTypeEnum('payment_type').notNull(),
    capitalReturnedPaise: bigint('capital_returned_paise', { mode: 'number' }).notNull().default(0),
    profitPaise: bigint('profit_paise', { mode: 'number' }).notNull().default(0),
    adjustmentPaise: bigint('adjustment_paise', { mode: 'number' }).notNull().default(0),
    paymentMode: paymentModeEnum('payment_mode').notNull(),
    referenceNumber: text('reference_number'),
    notes: text('notes'),
    isReversed: boolean('is_reversed').notNull().default(false),
    reversalOfId: uuid('reversal_of_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ac_payments_asset_date_idx').on(t.assetId, t.receivedAt),
    index('ac_payments_received_at_idx').on(t.receivedAt),
  ],
);

export const acSettlements = pgTable('ac_settlements', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  assetId: uuid('asset_id')
    .notNull()
    .unique()
    .references(() => acAssets.id, { onDelete: 'restrict' }),
  settledAt: date('settled_at').notNull(),
  totalInvestmentPaise: bigint('total_investment_paise', { mode: 'number' }).notNull(),
  totalReceivedPaise: bigint('total_received_paise', { mode: 'number' }).notNull(),
  grossProfitPaise: bigint('gross_profit_paise', { mode: 'number' }).notNull(),
  adminSharePaise: bigint('admin_share_paise', { mode: 'number' }).notNull(),
  partnerSharePaise: bigint('partner_share_paise', { mode: 'number' }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

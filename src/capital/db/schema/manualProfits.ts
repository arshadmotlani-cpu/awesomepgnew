import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { manualProfitCategoryEnum, profitShareModeEnum } from './enums';

export const acManualProfits = pgTable(
  'ac_manual_profits',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** Gross business profit before distribution */
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    profitDate: date('profit_date').notNull(),
    source: text('source').notNull(),
    description: text('description').notNull(),
    category: manualProfitCategoryEnum('category').notNull(),
    profitShareMode: profitShareModeEnum('profit_share_mode').notNull().default('percentage'),
    partnerSharePctBps: integer('partner_share_pct_bps').notNull().default(0),
    mySharePctBps: integer('my_share_pct_bps').notNull().default(10000),
    partnerSharePaise: bigint('partner_share_paise', { mode: 'number' }).notNull().default(0),
    mySharePaise: bigint('my_share_paise', { mode: 'number' }).notNull(),
    isReversed: boolean('is_reversed').notNull().default(false),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ac_manual_profits_date_idx').on(t.profitDate),
    index('ac_manual_profits_category_idx').on(t.category),
    index('ac_manual_profits_reversed_idx').on(t.isReversed),
  ],
);

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
import { manualProfitCategoryEnum } from './enums';

export const acManualProfits = pgTable(
  'ac_manual_profits',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    profitDate: date('profit_date').notNull(),
    source: text('source').notNull(),
    description: text('description').notNull(),
    category: manualProfitCategoryEnum('category').notNull(),
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

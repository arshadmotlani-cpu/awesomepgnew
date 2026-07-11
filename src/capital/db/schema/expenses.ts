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
import { acCategories } from './categories';
import { paymentModeEnum } from './enums';

export const acExpenses = pgTable(
  'ac_expenses',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => acAssets.id, { onDelete: 'restrict' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => acCategories.id, { onDelete: 'restrict' }),
    expenseDate: date('expense_date').notNull(),
    vendor: text('vendor'),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    description: text('description').notNull(),
    paymentMethod: paymentModeEnum('payment_method'),
    notes: text('notes'),
    isReversed: boolean('is_reversed').notNull().default(false),
    reversalOfId: uuid('reversal_of_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ac_expenses_asset_date_idx').on(t.assetId, t.expenseDate),
    index('ac_expenses_category_idx').on(t.categoryId),
  ],
);

import { sql } from 'drizzle-orm';
import { bigint, date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizationIdCol, locationIdCol, userIdCol } from './tenantColumns';
import type { FyhExpenseCategory, FyhExpensePaymentMethod } from '@/src/hair/lib/expenseCategories';
import { fyhPurchases } from './purchases';

export const fyhExpenses = pgTable(
  'fyh_expenses',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    locationId: locationIdCol(),
    title: text('title').notNull(),
    category: text('category').$type<FyhExpenseCategory>().notNull(),
    expenseDate: date('expense_date').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull().default(0),
    paymentMethod: text('payment_method').$type<FyhExpensePaymentMethod>().notNull().default('cash'),
    attachmentUrl: text('attachment_url'),
    notes: text('notes'),
    staffName: text('staff_name').notNull(),
    staffEmployeeId: uuid('staff_employee_id'),
    purchaseId: uuid('purchase_id').references(() => fyhPurchases.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_expenses_date_idx').on(t.expenseDate),
    index('fyh_expenses_category_idx').on(t.category),
    index('fyh_expenses_purchase_idx').on(t.purchaseId),
  ],
);

export type FyhExpense = typeof fyhExpenses.$inferSelect;

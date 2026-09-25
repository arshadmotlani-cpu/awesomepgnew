import { sql } from 'drizzle-orm';
import { bigint, date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizationIdCol, locationIdCol } from './tenantColumns';
import type { FyhExpenseCategory, FyhExpensePaymentMethod } from '@/src/hair/lib/expenseCategories';
import type {
  FyhExpenseFor,
  FyhExpensePaidBy,
  FyhExpenseSource,
  FyhExpenseStatus,
} from '@/src/hair/lib/expenseFields';
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
    expenseFor: text('expense_for').$type<FyhExpenseFor>(),
    paidBy: text('paid_by').$type<FyhExpensePaidBy>(),
    billNumber: text('bill_number'),
    companyName: text('company_name'),
    referenceId: text('reference_id'),
    source: text('source').$type<FyhExpenseSource>().notNull().default('manual'),
    status: text('status').$type<FyhExpenseStatus>().notNull().default('active'),
    attachmentUrl: text('attachment_url'),
    attachmentContentType: text('attachment_content_type'),
    notes: text('notes'),
    /** Recorder display name (audit). */
    staffName: text('staff_name').notNull(),
    /** Payer when paid_by = staff. */
    staffEmployeeId: uuid('staff_employee_id'),
    purchaseId: uuid('purchase_id').references(() => fyhPurchases.id, { onDelete: 'set null' }),
    createdByEmployeeId: uuid('created_by_employee_id'),
    updatedByEmployeeId: uuid('updated_by_employee_id'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledByEmployeeId: uuid('cancelled_by_employee_id'),
    cancellationReason: text('cancellation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_expenses_date_idx').on(t.expenseDate),
    index('fyh_expenses_category_idx').on(t.category),
    index('fyh_expenses_purchase_idx').on(t.purchaseId),
    index('fyh_expenses_status_idx').on(t.status),
    index('fyh_expenses_source_idx').on(t.source),
  ],
);

export type FyhExpense = typeof fyhExpenses.$inferSelect;

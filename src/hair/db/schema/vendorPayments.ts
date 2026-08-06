import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { FyhVendorPaymentMethod } from '@/src/hair/lib/vendorPaymentMethods';
import { fyhProducts } from './products';
import { fyhPurchases, fyhVendorPayables } from './purchases';
import { fyhVendors } from './vendors';

export const FYH_VENDOR_PAYMENT_STATUSES = ['active', 'reversed'] as const;
export type FyhVendorPaymentStatus = (typeof FYH_VENDOR_PAYMENT_STATUSES)[number];

export const fyhVendorPayments = pgTable(
  'fyh_vendor_payments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => fyhVendors.id, { onDelete: 'restrict' }),
    paymentNumber: text('payment_number').notNull().unique(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    paymentMethod: text('payment_method').$type<FyhVendorPaymentMethod>().notNull(),
    paymentDate: date('payment_date').notNull(),
    reference: text('reference'),
    notes: text('notes'),
    attachmentUrl: text('attachment_url'),
    attachmentContentType: text('attachment_content_type'),
    status: text('status').$type<FyhVendorPaymentStatus>().notNull().default('active'),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    reversedByStaffName: text('reversed_by_staff_name'),
    reversedByEmployeeId: uuid('reversed_by_employee_id'),
    reversalReason: text('reversal_reason'),
    staffName: text('staff_name').notNull(),
    staffEmployeeId: uuid('staff_employee_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_vendor_payments_vendor_idx').on(t.vendorId),
    index('fyh_vendor_payments_date_idx').on(t.paymentDate),
    index('fyh_vendor_payments_status_idx').on(t.status),
  ],
);

/** Links vendor payments to invoice-level payables. Unallocated payment = advance credit. */
export const fyhVendorPaymentAllocations = pgTable(
  'fyh_vendor_payment_allocations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => fyhVendorPayments.id, { onDelete: 'cascade' }),
    payableId: uuid('payable_id')
      .notNull()
      .references(() => fyhVendorPayables.id, { onDelete: 'restrict' }),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_vendor_payment_alloc_alloc_idx').on(t.payableId),
    index('fyh_vendor_payment_alloc_payment_idx').on(t.paymentId),
  ],
);

export const fyhPurchaseReturns = pgTable(
  'fyh_purchase_returns',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    purchaseId: uuid('purchase_id')
      .notNull()
      .references(() => fyhPurchases.id, { onDelete: 'restrict' }),
    payableId: uuid('payable_id')
      .notNull()
      .references(() => fyhVendorPayables.id, { onDelete: 'restrict' }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => fyhVendors.id, { onDelete: 'restrict' }),
    returnDate: date('return_date').notNull(),
    creditPaise: bigint('credit_paise', { mode: 'number' }).notNull().default(0),
    notes: text('notes'),
    staffName: text('staff_name').notNull(),
    staffEmployeeId: uuid('staff_employee_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_purchase_returns_purchase_idx').on(t.purchaseId),
    index('fyh_purchase_returns_vendor_idx').on(t.vendorId),
  ],
);

export const fyhPurchaseReturnLines = pgTable(
  'fyh_purchase_return_lines',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    returnId: uuid('return_id')
      .notNull()
      .references(() => fyhPurchaseReturns.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => fyhProducts.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
    unitCostPaise: bigint('unit_cost_paise', { mode: 'number' }).notNull().default(0),
    lineCreditPaise: bigint('line_credit_paise', { mode: 'number' }).notNull().default(0),
  },
  (t) => [index('fyh_purchase_return_lines_return_idx').on(t.returnId)],
);

export type FyhVendorPayment = typeof fyhVendorPayments.$inferSelect;
export type FyhVendorPaymentAllocation = typeof fyhVendorPaymentAllocations.$inferSelect;
export type FyhPurchaseReturn = typeof fyhPurchaseReturns.$inferSelect;

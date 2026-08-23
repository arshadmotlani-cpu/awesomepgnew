import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizationIdCol, locationIdCol, userIdCol } from './tenantColumns';
import { fyhProducts } from './products';
import { fyhVendors } from './vendors';

export const FYH_PURCHASE_STATUSES = ['posted', 'cancelled'] as const;
export type FyhPurchaseStatus = (typeof FYH_PURCHASE_STATUSES)[number];

export const fyhPurchases = pgTable(
  'fyh_purchases',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    locationId: locationIdCol(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => fyhVendors.id, { onDelete: 'restrict' }),
    purchaseNumber: text('purchase_number').notNull(),
    vendorInvoiceRef: text('vendor_invoice_ref'),
    purchaseDate: date('purchase_date').notNull(),
    totalPaise: bigint('total_paise', { mode: 'number' }).notNull().default(0),
    notes: text('notes'),
    attachmentUrl: text('attachment_url'),
    attachmentContentType: text('attachment_content_type'),
    attachmentUploadedAt: timestamp('attachment_uploaded_at', { withTimezone: true }),
    attachmentUploadedBy: text('attachment_uploaded_by'),
    status: text('status').$type<FyhPurchaseStatus>().notNull().default('posted'),
    staffName: text('staff_name').notNull(),
    staffEmployeeId: uuid('staff_employee_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('fyh_purchases_org_purchase_number_uidx').on(t.organizationId, t.purchaseNumber),
    index('fyh_purchases_vendor_idx').on(t.vendorId),
    index('fyh_purchases_date_idx').on(t.purchaseDate),
  ],
);

export const fyhPurchaseLines = pgTable(
  'fyh_purchase_lines',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    locationId: locationIdCol(),
    purchaseId: uuid('purchase_id')
      .notNull()
      .references(() => fyhPurchases.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => fyhProducts.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
    unitCostPaise: bigint('unit_cost_paise', { mode: 'number' }).notNull().default(0),
    lineTotalPaise: bigint('line_total_paise', { mode: 'number' }).notNull().default(0),
  },
  (t) => [index('fyh_purchase_lines_purchase_idx').on(t.purchaseId)],
);

export const FYH_PAYABLE_STATUSES = ['open', 'paid', 'partial'] as const;
export type FyhPayableStatus = (typeof FYH_PAYABLE_STATUSES)[number];

/**
 * One payable row per purchase invoice (1:1 via purchase_id UNIQUE).
 * Vendor-level outstanding is always computed as SUM(balance_paise) — never stored as a running total.
 */
export const fyhVendorPayables = pgTable(
  'fyh_vendor_payables',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => fyhVendors.id, { onDelete: 'restrict' }),
    purchaseId: uuid('purchase_id')
      .notNull()
      .unique()
      .references(() => fyhPurchases.id, { onDelete: 'cascade' }),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull().default(0),
    balancePaise: bigint('balance_paise', { mode: 'number' }).notNull().default(0),
    status: text('status').$type<FyhPayableStatus>().notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_vendor_payables_vendor_idx').on(t.vendorId),
    index('fyh_vendor_payables_status_idx').on(t.status),
  ],
);

export type FyhPurchase = typeof fyhPurchases.$inferSelect;
export type FyhPurchaseLine = typeof fyhPurchaseLines.$inferSelect;
export type FyhVendorPayable = typeof fyhVendorPayables.$inferSelect;

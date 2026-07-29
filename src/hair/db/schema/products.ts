import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const fyhProducts = pgTable(
  'fyh_products',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    sku: text('sku'),
    barcode: text('barcode'),
    brand: text('brand'),
    category: text('category'),
    description: text('description'),
    supplier: text('supplier'),
    batchNumber: text('batch_number'),
    expiryDate: date('expiry_date'),
    sellingPricePaise: bigint('selling_price_paise', { mode: 'number' }).notNull().default(0),
    costPricePaise: bigint('cost_price_paise', { mode: 'number' }).notNull().default(0),
    stockQty: numeric('stock_qty', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
    openingStock: numeric('opening_stock', { precision: 12, scale: 2, mode: 'number' })
      .notNull()
      .default(0),
    minStock: numeric('min_stock', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
    reorderLevel: numeric('reorder_level', { precision: 12, scale: 2, mode: 'number' })
      .notNull()
      .default(0),
    unit: text('unit').notNull().default('unit'),
    gstBps: integer('gst_bps').notNull().default(0),
    isRetail: boolean('is_retail').notNull().default(true),
    isConsumable: boolean('is_consumable').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_products_name_idx').on(t.name),
    index('fyh_products_active_idx').on(t.isActive),
    index('fyh_products_category_idx').on(t.category),
  ],
);

export type FyhProduct = typeof fyhProducts.$inferSelect;
export type NewFyhProduct = typeof fyhProducts.$inferInsert;

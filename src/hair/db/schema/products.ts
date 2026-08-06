import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { FyhProductType } from '@/src/hair/lib/productTypes';

export const fyhProducts = pgTable(
  'fyh_products',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    brand: text('brand'),
    category: text('category'),
    description: text('description'),
    supplier: text('supplier'),
    batchNumber: text('batch_number'),
    expiryDate: date('expiry_date'),
    productType: text('product_type').$type<FyhProductType>().notNull().default('retail'),
    sellingPricePaise: bigint('selling_price_paise', { mode: 'number' }).notNull().default(0),
    costPricePaise: bigint('cost_price_paise', { mode: 'number' }).notNull().default(0),
    stockQty: numeric('stock_qty', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
    openingStock: numeric('opening_stock', { precision: 12, scale: 2, mode: 'number' })
      .notNull()
      .default(0),
    minStock: numeric('min_stock', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_products_name_idx').on(t.name),
    index('fyh_products_active_idx').on(t.isActive),
    index('fyh_products_category_idx').on(t.category),
    index('fyh_products_type_idx').on(t.productType),
  ],
);

export type FyhProduct = typeof fyhProducts.$inferSelect;
export type NewFyhProduct = typeof fyhProducts.$inferInsert;

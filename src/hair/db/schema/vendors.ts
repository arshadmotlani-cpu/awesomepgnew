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
import { fyhProducts } from './products';

export const FYH_PO_STATUSES = ['draft', 'ordered', 'received', 'cancelled'] as const;
export type FyhPoStatus = (typeof FYH_PO_STATUSES)[number];

export const fyhVendors = pgTable(
  'fyh_vendors',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    companyName: text('company_name'),
    contactName: text('contact_name'),
    phone: text('phone'),
    email: text('email'),
    gstin: text('gstin'),
    address: text('address'),
    bankDetails: text('bank_details'),
    upiId: text('upi_id'),
    qrCodeUrl: text('qr_code_url'),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_vendors_name_idx').on(t.name),
    index('fyh_vendors_active_idx').on(t.isActive),
  ],
);

export const fyhPurchaseOrders = pgTable(
  'fyh_purchase_orders',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => fyhVendors.id, { onDelete: 'restrict' }),
    status: text('status').$type<FyhPoStatus>().notNull().default('draft'),
    poNumber: text('po_number').notNull(),
    orderedAt: timestamp('ordered_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_purchase_orders_vendor_idx').on(t.vendorId),
    index('fyh_purchase_orders_status_idx').on(t.status),
  ],
);

export const fyhPurchaseOrderLines = pgTable(
  'fyh_purchase_order_lines',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => fyhPurchaseOrders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => fyhProducts.id, { onDelete: 'restrict' }),
    quantityOrdered: numeric('quantity_ordered', {
      precision: 12,
      scale: 3,
      mode: 'number',
    }).notNull(),
    unitCostPaise: bigint('unit_cost_paise', { mode: 'number' }).notNull().default(0),
  },
  (t) => [
    index('fyh_purchase_order_lines_po_idx').on(t.purchaseOrderId),
    index('fyh_purchase_order_lines_product_idx').on(t.productId),
  ],
);

export const fyhGoodsReceipts = pgTable(
  'fyh_goods_receipts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    purchaseOrderId: uuid('purchase_order_id').references(() => fyhPurchaseOrders.id, {
      onDelete: 'set null',
    }),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => fyhVendors.id, { onDelete: 'restrict' }),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_goods_receipts_po_idx').on(t.purchaseOrderId),
    index('fyh_goods_receipts_vendor_idx').on(t.vendorId),
  ],
);

export const fyhGoodsReceiptLines = pgTable(
  'fyh_goods_receipt_lines',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    goodsReceiptId: uuid('goods_receipt_id')
      .notNull()
      .references(() => fyhGoodsReceipts.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => fyhProducts.id, { onDelete: 'restrict' }),
    quantityReceived: numeric('quantity_received', {
      precision: 12,
      scale: 3,
      mode: 'number',
    }).notNull(),
    unitCostPaise: bigint('unit_cost_paise', { mode: 'number' }).notNull().default(0),
    batchNumber: text('batch_number'),
    expiryDate: date('expiry_date'),
  },
  (t) => [
    index('fyh_goods_receipt_lines_grn_idx').on(t.goodsReceiptId),
    index('fyh_goods_receipt_lines_product_idx').on(t.productId),
  ],
);

export const fyhStockAdjustments = pgTable(
  'fyh_stock_adjustments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    productId: uuid('product_id')
      .notNull()
      .references(() => fyhProducts.id, { onDelete: 'restrict' }),
    quantityDelta: numeric('quantity_delta', {
      precision: 12,
      scale: 3,
      mode: 'number',
    }).notNull(),
    reason: text('reason').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fyh_stock_adjustments_product_idx').on(t.productId, t.createdAt)],
);

export const fyhProductBatches = pgTable(
  'fyh_product_batches',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    productId: uuid('product_id')
      .notNull()
      .references(() => fyhProducts.id, { onDelete: 'restrict' }),
    batchNumber: text('batch_number').notNull(),
    expiryDate: date('expiry_date'),
    qtyOnHand: numeric('qty_on_hand', { precision: 12, scale: 3, mode: 'number' })
      .notNull()
      .default(0),
    costPricePaise: bigint('cost_price_paise', { mode: 'number' }).notNull().default(0),
  },
  (t) => [index('fyh_product_batches_product_idx').on(t.productId)],
);

export type FyhVendor = typeof fyhVendors.$inferSelect;
export type FyhPurchaseOrder = typeof fyhPurchaseOrders.$inferSelect;
export type FyhPurchaseOrderLine = typeof fyhPurchaseOrderLines.$inferSelect;
export type FyhGoodsReceipt = typeof fyhGoodsReceipts.$inferSelect;
export type FyhGoodsReceiptLine = typeof fyhGoodsReceiptLines.$inferSelect;
export type FyhStockAdjustment = typeof fyhStockAdjustments.$inferSelect;
export type FyhProductBatch = typeof fyhProductBatches.$inferSelect;

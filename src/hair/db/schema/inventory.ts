import { sql } from 'drizzle-orm';
import {
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizationIdCol, locationIdCol, userIdCol } from './tenantColumns';
import { fyhProducts } from './products';

export const FYH_STOCK_MOVEMENT_TYPES = [
  'opening',
  'purchase',
  'sale',
  'consumption',
  'adjustment',
  'return',
  'transfer',
] as const;
export type FyhStockMovementType = (typeof FYH_STOCK_MOVEMENT_TYPES)[number];

/**
 * Append-only stock ledger. Product qty extension lives on fyh_products;
 * this table records each movement for inventory audit (Phase 3).
 */
export const fyhStockMovements = pgTable(
  'fyh_stock_movements',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    locationId: locationIdCol(),
    productId: uuid('product_id')
      .notNull()
      .references(() => fyhProducts.id, { onDelete: 'restrict' }),
    movementType: text('movement_type').$type<FyhStockMovementType>().notNull(),
    /** Signed quantity delta (negative = outbound). */
    quantityDelta: numeric('quantity_delta', {
      precision: 12,
      scale: 3,
      mode: 'number',
    }).notNull(),
    /** Stock qty after applying this movement (audit snapshot). */
    quantityAfter: numeric('quantity_after', {
      precision: 12,
      scale: 3,
      mode: 'number',
    }),
    /** Optional link to invoice / appointment / purchase — opaque until engines wire. */
    referenceType: text('reference_type'),
    referenceId: uuid('reference_id'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_stock_movements_product_idx').on(t.productId, t.createdAt),
    index('fyh_stock_movements_type_idx').on(t.movementType),
    index('fyh_stock_movements_reference_idx').on(t.referenceType, t.referenceId),
  ],
);

export type FyhStockMovement = typeof fyhStockMovements.$inferSelect;
export type NewFyhStockMovement = typeof fyhStockMovements.$inferInsert;

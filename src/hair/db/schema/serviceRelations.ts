import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  numeric,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizationIdCol } from './tenantColumns';
import { fyhProducts } from './products';
import { fyhServices } from './services';
import { fyhStaff } from './staff';

export const fyhServiceStaff = pgTable(
  'fyh_service_staff',
  {
    serviceId: uuid('service_id')
      .notNull()
      .references(() => fyhServices.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => fyhStaff.id, { onDelete: 'cascade' }),
    organizationId: organizationIdCol(),
  },
  (t) => [primaryKey({ columns: [t.serviceId, t.staffId] })],
);

export const fyhServiceConsumables = pgTable(
  'fyh_service_consumables',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => fyhServices.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => fyhProducts.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { precision: 12, scale: 3, mode: 'number' }).notNull().default(1),
    /** When true, paid service invoices reduce product stock for this kit row. */
    deductInventory: boolean('deduct_inventory').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fyh_service_consumables_service_idx').on(t.serviceId)],
);

export type FyhServiceConsumable = typeof fyhServiceConsumables.$inferSelect;

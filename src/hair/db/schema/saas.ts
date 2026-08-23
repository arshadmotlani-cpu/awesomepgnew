import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizationIdCol } from './tenantColumns';

export const fyhTenantMirror = pgTable('fyh_tenant_mirror', {
  organizationId: organizationIdCol().primaryKey(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fyhOrgInvoiceSequences = pgTable('fyh_org_invoice_sequences', {
  organizationId: organizationIdCol().primaryKey(),
  prefix: text('prefix').notNull().default('INV'),
  nextSeq: integer('next_seq').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fyhOrgCustomerSequences = pgTable('fyh_org_customer_sequences', {
  organizationId: organizationIdCol().primaryKey(),
  nextSeq: integer('next_seq').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fyhStaffLocations = pgTable(
  'fyh_staff_locations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    staffId: uuid('staff_id').notNull(),
    organizationId: organizationIdCol().notNull(),
    locationId: uuid('location_id').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('fyh_staff_locations_staff_location_uidx').on(t.staffId, t.locationId),
    index('fyh_staff_locations_org_idx').on(t.organizationId),
    index('fyh_staff_locations_location_idx').on(t.locationId),
  ],
);

export const fyhLocationStock = pgTable(
  'fyh_location_stock',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol().notNull(),
    locationId: uuid('location_id').notNull(),
    productId: uuid('product_id').notNull(),
    quantity: integer('quantity').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('fyh_location_stock_org_loc_product_uidx').on(
      t.organizationId,
      t.locationId,
      t.productId,
    ),
    index('fyh_location_stock_org_idx').on(t.organizationId),
    index('fyh_location_stock_location_idx').on(t.locationId),
  ],
);

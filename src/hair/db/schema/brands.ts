import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizationIdCol, locationIdCol, userIdCol } from './tenantColumns';
import { fyhVendors } from './vendors';

export const fyhBrands = pgTable(
  'fyh_brands',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    name: text('name').notNull().unique(),
    vendorId: uuid('vendor_id').references(() => fyhVendors.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fyh_brands_vendor_idx').on(t.vendorId)],
);

export type FyhBrand = typeof fyhBrands.$inferSelect;

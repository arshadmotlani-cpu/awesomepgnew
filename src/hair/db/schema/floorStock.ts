import { sql } from 'drizzle-orm';
import { numeric, pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { organizationIdCol, locationIdCol, userIdCol } from './tenantColumns';
import { fyhProducts } from './products';

export const fyhFloorIssues = pgTable(
  'fyh_floor_issues',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    organizationId: organizationIdCol(),
    locationId: locationIdCol(),
    productId: uuid('product_id')
      .notNull()
      .references(() => fyhProducts.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    issuedByName: text('issued_by_name').notNull(),
    issuedByEmployeeId: uuid('issued_by_employee_id'),
    returnedAt: timestamp('returned_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_floor_issues_product_idx').on(t.productId),
    index('fyh_floor_issues_open_idx').on(t.returnedAt),
  ],
);

export type FyhFloorIssue = typeof fyhFloorIssues.$inferSelect;

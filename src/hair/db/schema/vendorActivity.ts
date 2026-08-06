import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { fyhPurchases } from './purchases';
import { fyhVendors } from './vendors';

export const fyhPurchaseAuditEvents = pgTable(
  'fyh_purchase_audit_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    purchaseId: uuid('purchase_id')
      .notNull()
      .references(() => fyhPurchases.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    diff: jsonb('diff').notNull().default({}),
    staffName: text('staff_name').notNull(),
    staffEmployeeId: uuid('staff_employee_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fyh_purchase_audit_events_purchase_idx').on(t.purchaseId, t.createdAt)],
);

export const fyhVendorNotes = pgTable(
  'fyh_vendor_notes',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => fyhVendors.id, { onDelete: 'cascade' }),
    note: text('note').notNull(),
    staffName: text('staff_name').notNull(),
    staffEmployeeId: uuid('staff_employee_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fyh_vendor_notes_vendor_idx').on(t.vendorId, t.createdAt)],
);

export type FyhPurchaseAuditEvent = typeof fyhPurchaseAuditEvents.$inferSelect;
export type FyhVendorNote = typeof fyhVendorNotes.$inferSelect;

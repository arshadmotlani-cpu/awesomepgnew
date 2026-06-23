import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { bookings } from './bookings';
import { customers } from './customers';
import { pgs } from './pgs';

export const residentUploadEvents = pgTable(
  'resident_upload_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    pgId: uuid('pg_id').references(() => pgs.id, { onDelete: 'set null' }),
    uploadType: text('upload_type').notNull(),
    storagePath: text('storage_path').notNull(),
    status: text('status').notNull().default('uploaded'),
    adminVisible: boolean('admin_visible').notNull().default(false),
    adminQueue: text('admin_queue'),
    linkedEntity: text('linked_entity'),
    linkedEntityId: uuid('linked_entity_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('resident_upload_events_customer_idx').on(t.customerId, t.createdAt),
    index('resident_upload_events_storage_path_idx').on(t.storagePath),
    index('resident_upload_events_admin_visible_idx').on(t.adminVisible, t.createdAt),
    index('resident_upload_events_created_at_idx').on(t.createdAt),
  ],
);

export type ResidentUploadEvent = typeof residentUploadEvents.$inferSelect;
export type NewResidentUploadEvent = typeof residentUploadEvents.$inferInsert;

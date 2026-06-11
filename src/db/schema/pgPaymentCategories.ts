import { sql } from 'drizzle-orm';
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { pgs } from './pgs';

export const pgPaymentCategories = pgTable('pg_payment_categories', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  pgId: uuid('pg_id')
    .notNull()
    .references(() => pgs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  qrCodeImageUrl: text('qr_code_image_url').notNull(),
  upiId: text('upi_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PgPaymentCategory = typeof pgPaymentCategories.$inferSelect;
export type NewPgPaymentCategory = typeof pgPaymentCategories.$inferInsert;

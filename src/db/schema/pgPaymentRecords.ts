import { sql } from 'drizzle-orm';
import { bigint, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pgPaymentRecordStatusEnum } from './enums';
import { bookings } from './bookings';
import { customers } from './customers';
import { pgPaymentCategories } from './pgPaymentCategories';
import { pgs } from './pgs';

export const pgPaymentRecords = pgTable(
  'pg_payment_records',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    pgId: uuid('pg_id')
      .notNull()
      .references(() => pgs.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => pgPaymentCategories.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    month: text('month'),
    status: pgPaymentRecordStatusEnum('status').notNull().default('pending'),
    paymentScreenshotUrl: text('payment_screenshot_url').notNull(),
    transactionRef: text('transaction_ref'),
    reviewedByAdminId: uuid('reviewed_by_admin_id'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('pg_payment_records_pending_month_unique')
      .on(t.categoryId, t.customerId, t.month)
      .where(sql`${t.status} = 'pending' AND ${t.month} IS NOT NULL`),
    uniqueIndex('pg_payment_records_pending_booking_unique')
      .on(t.bookingId)
      .where(sql`${t.status} = 'pending' AND ${t.bookingId} IS NOT NULL`),
  ],
);

export type PgPaymentRecord = typeof pgPaymentRecords.$inferSelect;
export type NewPgPaymentRecord = typeof pgPaymentRecords.$inferInsert;

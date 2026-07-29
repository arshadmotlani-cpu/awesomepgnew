import { sql } from 'drizzle-orm';
import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export type FyhBusinessHoursDay = {
  dayOfWeek: number;
  open: string;
  close: string;
  closed?: boolean;
};

export const fyhSettings = pgTable('fyh_settings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  businessName: text('business_name').notNull().default('For Your Hair'),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  themeDefault: text('theme_default').notNull().default('dark'),
  businessAddress: text('business_address'),
  gstin: text('gstin'),
  invoicePrefix: text('invoice_prefix').notNull().default('FYH'),
  invoiceNextSeq: integer('invoice_next_seq').notNull().default(1),
  defaultGstBps: integer('default_gst_bps').notNull().default(1800),
  defaultBufferMinutes: integer('default_buffer_minutes').notNull().default(0),
  currency: text('currency').notNull().default('INR'),
  businessHours: jsonb('business_hours').$type<FyhBusinessHoursDay[]>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

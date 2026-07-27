import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const fyhSettings = pgTable('fyh_settings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  businessName: text('business_name').notNull().default('For Your Hair'),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  themeDefault: text('theme_default').notNull().default('dark'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

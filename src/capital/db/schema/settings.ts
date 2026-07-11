import { sql } from 'drizzle-orm';
import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const acSettings = pgTable('ac_settings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  businessName: text('business_name').notNull().default('Automotive Capital'),
  logoUrl: text('logo_url'),
  profitShareNumerator: integer('profit_share_numerator').notNull().default(1),
  profitShareDenominator: integer('profit_share_denominator').notNull().default(2),
  currencyCode: text('currency_code').notNull().default('INR'),
  themeTokens: jsonb('theme_tokens').$type<Record<string, string>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

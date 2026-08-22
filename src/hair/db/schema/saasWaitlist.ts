import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * SaaS marketing waitlist only.
 * No FKs to fyh_customers, fyh_invoices, staff, or Platform orgs.
 */
export const saasWaitlistSignups = pgTable('saas_waitlist_signups', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  salonName: text('salon_name').notNull(),
  ownerName: text('owner_name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  city: text('city'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

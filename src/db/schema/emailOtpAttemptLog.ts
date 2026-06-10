import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { citext } from './customTypes';

export const emailOtpAttemptLog = pgTable(
  'email_otp_attempt_log',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    email: citext('email').notNull(),
    action: text('action').notNull(),
    success: boolean('success').notNull(),
    reason: text('reason'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('email_otp_attempt_log_email_created_idx').on(t.email, t.createdAt),
    index('email_otp_attempt_log_ip_created_idx').on(t.ip, t.createdAt),
  ],
);

export type EmailOtpAttemptLog = typeof emailOtpAttemptLog.$inferSelect;

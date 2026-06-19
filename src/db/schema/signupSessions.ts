import { pgTable, text, timestamp, uuid, boolean, index } from 'drizzle-orm/pg-core';
import { citext } from '@/src/db/schema/customTypes';

/** Temporary signup state — no customer row until password is set. */
export const signupSessions = pgTable(
  'signup_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: citext('email').notNull(),
    fullName: text('full_name'),
    phone: text('phone'),
    otpVerified: boolean('otp_verified').notNull().default(false),
    profileSubmitted: boolean('profile_submitted').notNull().default(false),
    status: text('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index('signup_sessions_email_idx').on(t.email),
    statusIdx: index('signup_sessions_status_expires_idx').on(t.status, t.expiresAt),
  }),
);

export type SignupSessionRow = typeof signupSessions.$inferSelect;

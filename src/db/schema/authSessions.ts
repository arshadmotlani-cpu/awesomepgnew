import { sql } from 'drizzle-orm';
import { boolean, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const authSessionKindEnum = pgEnum('auth_session_kind', ['customer', 'admin']);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    kind: authSessionKindEnum('kind').notNull(),
    subjectId: uuid('subject_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    /** When true (admin sessions), cookie and DB expiry use the long remember-me window. */
    rememberMe: boolean('remember_me').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('auth_sessions_token_hash_unique').on(t.tokenHash),
    index('auth_sessions_subject_idx').on(t.kind, t.subjectId),
    index('auth_sessions_expires_at_idx').on(t.expiresAt),
  ],
);

export type AuthSession = typeof authSessions.$inferSelect;

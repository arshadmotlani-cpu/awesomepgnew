import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const ooAdminUsers = pgTable('oo_admin_users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ooAuthSessions = pgTable(
  'oo_auth_sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => ooAdminUsers.id, { onDelete: 'restrict' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('oo_auth_sessions_token_idx').on(t.tokenHash),
    index('oo_auth_sessions_admin_idx').on(t.adminUserId),
  ],
);

/** Durable inbox for ecosystem events Owner OS consumes (no fake payloads). */
export const ooEventInbox = pgTable(
  'oo_event_inbox',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    eventType: text('event_type').notNull(),
    sourceEngine: text('source_engine').notNull(),
    sourceBrain: text('source_brain'),
    payload: text('payload').notNull().default('{}'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('oo_event_inbox_type_idx').on(t.eventType),
    index('oo_event_inbox_created_idx').on(t.createdAt),
  ],
);

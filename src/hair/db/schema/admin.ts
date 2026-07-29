import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const FYH_ADMIN_ROLES = ['admin', 'super_admin'] as const;
export type FyhAdminRole = (typeof FYH_ADMIN_ROLES)[number];

export const fyhAdminUsers = pgTable('fyh_admin_users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  role: text('role').$type<FyhAdminRole>().notNull().default('admin'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fyhAuthSessions = pgTable(
  'fyh_auth_sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => fyhAdminUsers.id, { onDelete: 'restrict' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_auth_sessions_token_idx').on(t.tokenHash),
    index('fyh_auth_sessions_admin_idx').on(t.adminUserId),
  ],
);

import { sql } from 'drizzle-orm';
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { citext } from './customTypes';
import { adminRoleEnum } from './enums';

export const adminUsers = pgTable(
  'admin_users',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    fullName: text('full_name').notNull(),
    email: citext('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: adminRoleEnum('role').notNull(),
    // Empty array == all PGs (super_admin scope); otherwise the admin can only
    // manage PGs whose id appears in this array.
    pgScope: uuid('pg_scope').array().notNull().default(sql`'{}'::uuid[]`),
    isActive: boolean('is_active').notNull().default(true),
    /** When true, admin is redirected to change-password before using the console. */
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('admin_users_email_unique').on(t.email)],
);

export type AdminUser = typeof adminUsers.$inferSelect;
export type NewAdminUser = typeof adminUsers.$inferInsert;

import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';

export const adminPasswordResetTokens = pgTable(
  'admin_password_reset_tokens',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('admin_password_reset_tokens_hash_idx').on(t.tokenHash),
    index('admin_password_reset_tokens_admin_created_idx').on(t.adminId, t.createdAt),
  ],
);

export type AdminPasswordResetToken = typeof adminPasswordResetTokens.$inferSelect;

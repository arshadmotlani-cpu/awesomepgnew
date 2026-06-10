import { index, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const systemHealth = pgTable(
  'system_health',
  {
    id: serial('id').primaryKey(),
    status: text('status').notNull(),
    dbStatus: text('db_status').notNull(),
    envStatus: text('env_status').notNull(),
    lastError: text('last_error'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('system_health_updated_at_idx').on(t.updatedAt)],
);

export type SystemHealthRow = typeof systemHealth.$inferSelect;
export type NewSystemHealthRow = typeof systemHealth.$inferInsert;

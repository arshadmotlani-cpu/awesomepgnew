import { index, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export type AppLogMeta = Record<string, unknown>;

export const appLogs = pgTable(
  'app_logs',
  {
    id: serial('id').primaryKey(),
    level: text('level').notNull(),
    message: text('message').notNull(),
    meta: jsonb('meta').$type<AppLogMeta>().notNull().default({}),
    route: text('route'),
    method: text('method'),
    userId: text('user_id'),
    requestId: text('request_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('app_logs_created_at_idx').on(t.createdAt),
    index('app_logs_level_idx').on(t.level),
    index('app_logs_route_idx').on(t.route),
  ],
);

export type AppLog = typeof appLogs.$inferSelect;
export type NewAppLog = typeof appLogs.$inferInsert;

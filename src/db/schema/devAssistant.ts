import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';

export const devAssistantConversations = pgTable(
  'dev_assistant_conversations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('New conversation'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('dev_assistant_conversations_admin_idx').on(t.adminId, t.updatedAt)],
);

export const devAssistantMessages = pgTable(
  'dev_assistant_messages',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => devAssistantConversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull().$type<'user' | 'assistant' | 'system'>(),
    content: text('content').notNull(),
    contextSnapshot: jsonb('context_snapshot').$type<Record<string, unknown> | null>(),
    screenshotDataUrl: text('screenshot_data_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('dev_assistant_messages_conversation_idx').on(t.conversationId, t.createdAt)],
);

export type DevAssistantConversation = typeof devAssistantConversations.$inferSelect;
export type DevAssistantMessage = typeof devAssistantMessages.$inferSelect;

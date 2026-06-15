import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';

export type DevAssistantMode = 'ask' | 'plan' | 'agent';

export type DevAssistantTaskStatus =
  | 'analyzing'
  | 'planning'
  | 'implementing'
  | 'testing'
  | 'deploying'
  | 'completed'
  | 'failed'
  | 'cancelled';

export const devAssistantConversations = pgTable(
  'dev_assistant_conversations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('Dev workspace'),
    activeMode: text('active_mode').notNull().default('ask').$type<DevAssistantMode>(),
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
    mode: text('mode').$type<DevAssistantMode>(),
    metadata: jsonb('metadata').$type<DevAssistantMessageMetadata | null>(),
    contextSnapshot: jsonb('context_snapshot').$type<Record<string, unknown> | null>(),
    screenshotDataUrl: text('screenshot_data_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('dev_assistant_messages_conversation_idx').on(t.conversationId, t.createdAt)],
);

export type DevAssistantMessageMetadata = {
  planMarkdown?: string;
  suggestedFix?: string;
  canHandoffToAgent?: boolean;
  canImplementPlan?: boolean;
  relatedTaskId?: string;
  issueSummary?: string;
};

export const devAssistantTasks = pgTable(
  'dev_assistant_tasks',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => devAssistantConversations.id, {
      onDelete: 'set null',
    }),
    sourceMessageId: uuid('source_message_id'),
    title: text('title').notNull(),
    instruction: text('instruction').notNull(),
    planMarkdown: text('plan_markdown'),
    status: text('status').notNull().default('analyzing').$type<DevAssistantTaskStatus>(),
    resultSummary: text('result_summary'),
    implementationNotes: text('implementation_notes'),
    deploymentId: text('deployment_id'),
    deploymentVersion: text('deployment_version'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('dev_assistant_tasks_admin_idx').on(t.adminId, t.createdAt),
    index('dev_assistant_tasks_status_idx').on(t.status, t.updatedAt),
  ],
);

export const devAssistantTaskEvents = pgTable(
  'dev_assistant_task_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    taskId: uuid('task_id')
      .notNull()
      .references(() => devAssistantTasks.id, { onDelete: 'cascade' }),
    status: text('status').notNull().$type<DevAssistantTaskStatus>(),
    message: text('message').notNull(),
    detail: jsonb('detail').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('dev_assistant_task_events_task_idx').on(t.taskId, t.createdAt)],
);

export type DevAssistantConversation = typeof devAssistantConversations.$inferSelect;
export type DevAssistantMessage = typeof devAssistantMessages.$inferSelect;
export type DevAssistantTask = typeof devAssistantTasks.$inferSelect;
export type DevAssistantTaskEvent = typeof devAssistantTaskEvents.$inferSelect;

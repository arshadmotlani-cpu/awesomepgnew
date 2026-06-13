import { sql } from 'drizzle-orm';
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { automationEvents } from './automationEvents';

export const automationActionChannelEnum = pgEnum('automation_action_channel', [
  'whatsapp',
  'email',
  'sms',
]);

export const automationActionRecipientEnum = pgEnum('automation_action_recipient', [
  'resident',
  'owner',
  'admin',
]);

export const automationActionStatusEnum = pgEnum('automation_action_status', [
  'queued',
  'sent',
  'failed',
]);

export const automationActions = pgTable(
  'automation_actions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    eventId: uuid('event_id')
      .notNull()
      .references(() => automationEvents.id, { onDelete: 'cascade' }),
    channel: automationActionChannelEnum('channel').notNull(),
    recipient: automationActionRecipientEnum('recipient').notNull(),
    templateType: text('template_type').notNull(),
    message: text('message').notNull(),
    status: automationActionStatusEnum('status').notNull().default('queued'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('automation_actions_event_idx').on(t.eventId),
    index('automation_actions_status_idx').on(t.status, t.createdAt),
  ],
);

export type AutomationAction = typeof automationActions.$inferSelect;
export type NewAutomationAction = typeof automationActions.$inferInsert;

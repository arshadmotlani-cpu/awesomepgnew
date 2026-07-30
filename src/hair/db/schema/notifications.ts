import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const FYH_OUTBOX_STATUSES = ['pending', 'sent', 'failed'] as const;
export type FyhOutboxStatus = (typeof FYH_OUTBOX_STATUSES)[number];

export const FYH_NOTIFICATION_KINDS = [
  'appointment_reminder',
  'appointment_confirmation',
  'birthday',
  'anniversary',
  'membership_expiry',
  'package_expiry',
  'outstanding_payment',
  'review_request',
  'follow_up',
  'low_stock',
  'invoice_ready',
] as const;
export type FyhNotificationKind = (typeof FYH_NOTIFICATION_KINDS)[number];

export const fyhNotificationTemplates = pgTable(
  'fyh_notification_templates',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    kind: text('kind').$type<FyhNotificationKind>().notNull().unique(),
    channel: text('channel').notNull().default('whatsapp'),
    subject: text('subject'),
    body: text('body').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fyh_notification_templates_kind_idx').on(t.kind)],
);

export const fyhNotificationOutbox = pgTable(
  'fyh_notification_outbox',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    kind: text('kind').$type<FyhNotificationKind>().notNull(),
    channel: text('channel').notNull().default('whatsapp'),
    recipient: text('recipient').notNull(),
    subject: text('subject'),
    body: text('body').notNull(),
    status: text('status').$type<FyhOutboxStatus>().notNull().default('pending'),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    error: text('error'),
    metadata: text('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('fyh_notification_outbox_status_idx').on(t.status, t.scheduledFor),
    index('fyh_notification_outbox_kind_idx').on(t.kind),
  ],
);

export type FyhNotificationTemplate = typeof fyhNotificationTemplates.$inferSelect;
export type FyhNotificationOutbox = typeof fyhNotificationOutbox.$inferSelect;

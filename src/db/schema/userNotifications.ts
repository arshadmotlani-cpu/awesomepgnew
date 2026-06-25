import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const notificationAudienceEnum = pgEnum('notification_audience', ['admin', 'resident']);

export const notificationPriorityEnum = pgEnum('notification_priority', [
  'critical',
  'important',
  'informational',
]);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull(),
    audience: notificationAudienceEnum('audience').notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    priority: notificationPriorityEnum('priority').notNull().default('informational'),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    deepLink: text('deep_link').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    isRead: boolean('is_read').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [
    unique('notifications_dedupe_unique').on(t.audience, t.userId, t.dedupeKey),
    index('notifications_user_unread_idx').on(
      t.audience,
      t.userId,
      t.isRead,
      t.isArchived,
      t.createdAt,
    ),
    index('notifications_type_idx').on(t.type, t.createdAt),
  ],
);

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull(),
    audience: notificationAudienceEnum('audience').notNull(),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    deviceName: text('device_name'),
    platform: text('platform'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.audience, t.userId)],
);

export type UserNotification = typeof notifications.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

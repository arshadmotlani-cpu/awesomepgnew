import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';
import { customers } from './customers';
import { actionItemTypeEnum, adminNotificationStateEnum } from './enums';
import { pgs } from './pgs';

export const adminNotifications = pgTable(
  'admin_notifications',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    sourceKey: text('source_key').notNull(),
    type: actionItemTypeEnum('type').notNull(),
    title: text('title').notNull(),
    pgId: uuid('pg_id')
      .notNull()
      .references(() => pgs.id, { onDelete: 'cascade' }),
    residentId: uuid('resident_id').references(() => customers.id, { onDelete: 'set null' }),
    href: text('href').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('admin_notifications_source_key_unique').on(t.sourceKey),
    index('admin_notifications_type_created_idx').on(t.type, t.createdAt),
  ],
);

export const adminNotificationStates = pgTable(
  'admin_notification_states',
  {
    adminId: uuid('admin_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    notificationId: uuid('notification_id')
      .notNull()
      .references(() => adminNotifications.id, { onDelete: 'cascade' }),
    state: adminNotificationStateEnum('state').notNull().default('unread'),
    readAt: timestamp('read_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.adminId, t.notificationId] }),
    index('admin_notification_states_admin_unread_idx').on(t.adminId, t.state),
  ],
);

export type AdminNotification = typeof adminNotifications.$inferSelect;

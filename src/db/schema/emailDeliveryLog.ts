import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { customers } from './customers';

export const emailDeliveryLog = pgTable(
  'email_delivery_log',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    recipientEmail: text('recipient_email').notNull(),
    /** tenant | admin_copy | direct */
    recipientKind: text('recipient_kind').notNull(),
    subject: text('subject').notNull(),
    notificationKind: text('notification_kind').notNull(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    /** sent | failed | skipped */
    status: text('status').notNull(),
    skipReason: text('skip_reason'),
    provider: text('provider'),
    messageId: text('message_id'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('email_delivery_log_created_at_idx').on(t.createdAt),
    index('email_delivery_log_status_idx').on(t.status),
  ],
);

export type EmailDeliveryLogEntry = typeof emailDeliveryLog.$inferSelect;

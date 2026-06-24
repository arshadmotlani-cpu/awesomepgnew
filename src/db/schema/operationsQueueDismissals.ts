import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';
import { bookings } from './bookings';
import { checkoutSettlements } from './checkoutSettlements';
import { customers } from './customers';
import { vacatingRequests } from './vacatingRequests';

export const operationsQueueDismissals = pgTable(
  'operations_queue_dismissals',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    vacatingRequestId: uuid('vacating_request_id').references(() => vacatingRequests.id, {
      onDelete: 'set null',
    }),
    settlementId: uuid('settlement_id').references(() => checkoutSettlements.id, {
      onDelete: 'set null',
    }),
    queueItemId: text('queue_item_id').notNull(),
    category: text('category').notNull(),
    dismissedBy: uuid('dismissed_by')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'restrict' }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('operations_queue_dismissals_customer_idx').on(t.customerId, t.dismissedAt),
    index('operations_queue_dismissals_booking_idx').on(t.bookingId),
    uniqueIndex('operations_queue_dismissals_queue_item_unique').on(t.queueItemId),
  ],
);

export type OperationsQueueDismissal = typeof operationsQueueDismissals.$inferSelect;
export type NewOperationsQueueDismissal = typeof operationsQueueDismissals.$inferInsert;

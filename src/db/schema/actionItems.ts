import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { beds } from './beds';
import { customers } from './customers';
import { pgs } from './pgs';
import { rooms } from './rooms';
import {
  actionItemPriorityEnum,
  actionItemStatusEnum,
  actionItemTypeEnum,
} from './enums';

export const actionItems = pgTable(
  'action_items',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    type: actionItemTypeEnum('type').notNull(),
    title: text('title').notNull(),
    pgId: uuid('pg_id')
      .notNull()
      .references(() => pgs.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    bedId: uuid('bed_id').references(() => beds.id, { onDelete: 'set null' }),
    residentId: uuid('resident_id').references(() => customers.id, { onDelete: 'set null' }),
    amount: bigint('amount', { mode: 'number' }),
    dueDate: date('due_date'),
    status: actionItemStatusEnum('status').notNull().default('open'),
    priority: actionItemPriorityEnum('priority').notNull().default('medium'),
    sourceKey: text('source_key').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('action_items_source_key_unique').on(t.sourceKey),
    index('action_items_status_type_idx').on(t.status, t.type, t.createdAt),
    index('action_items_pg_idx').on(t.pgId, t.status),
  ],
);

export type ActionItem = typeof actionItems.$inferSelect;
export type NewActionItem = typeof actionItems.$inferInsert;

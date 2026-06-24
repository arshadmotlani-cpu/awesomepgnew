import { sql } from 'drizzle-orm';
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { customers } from './customers';
import { pgs } from './pgs';
import {
  unresolvedActionPriorityEnum,
  unresolvedActionStatusEnum,
  unresolvedActionTypeEnum,
} from './enums';

export const unresolvedActions = pgTable(
  'unresolved_actions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    actionType: unresolvedActionTypeEnum('action_type').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    residentId: uuid('resident_id').references(() => customers.id, { onDelete: 'set null' }),
    pgId: uuid('pg_id').references(() => pgs.id, { onDelete: 'set null' }),
    status: unresolvedActionStatusEnum('status').notNull().default('OPEN'),
    priority: unresolvedActionPriorityEnum('priority').notNull().default('medium'),
    sourceKey: text('source_key').notNull(),
    href: text('href'),
    label: text('label'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('unresolved_actions_source_key_unique').on(t.sourceKey),
    uniqueIndex('unresolved_actions_entity_unique').on(
      t.actionType,
      t.entityType,
      t.entityId,
    ),
    index('unresolved_actions_open_type_idx').on(t.status, t.actionType, t.createdAt),
    index('unresolved_actions_resident_open_idx').on(t.residentId, t.status),
    index('unresolved_actions_pg_open_idx').on(t.pgId, t.status),
  ],
);

export type UnresolvedAction = typeof unresolvedActions.$inferSelect;
export type NewUnresolvedAction = typeof unresolvedActions.$inferInsert;

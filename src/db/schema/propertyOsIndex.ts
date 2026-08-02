import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { PropertyOsIndexSnapshot } from '@/src/roomOs/types';
import { pgs } from './pgs';

/** Materialized Property OS index — truth level 3 serve cache. */
export const propertyOsIndex = pgTable(
  'property_os_index',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    pgId: uuid('pg_id')
      .notNull()
      .references(() => pgs.id, { onDelete: 'cascade' }),
    billingMonth: date('billing_month').notNull(),
    asOf: date('as_of').notNull(),
    contentHash: text('content_hash').notNull(),
    snapshot: jsonb('snapshot').$type<PropertyOsIndexSnapshot>().notNull(),
    snapshotVersion: integer('snapshot_version').notNull().default(1),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull(),
    sourceEventId: uuid('source_event_id'),
    materializedAt: timestamp('materialized_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('property_os_index_pg_month_unique').on(t.pgId, t.billingMonth),
    index('property_os_index_pg_materialized_idx').on(t.pgId, t.materializedAt),
  ],
);

export type PropertyOsIndexRow = typeof propertyOsIndex.$inferSelect;
export type NewPropertyOsIndexRow = typeof propertyOsIndex.$inferInsert;

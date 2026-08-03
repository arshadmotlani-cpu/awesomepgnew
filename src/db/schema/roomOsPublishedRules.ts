import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const ROOM_OS_PUBLISHED_RULE_STATUSES = ['active', 'inactive'] as const;
export type RoomOsPublishedRuleStatus = (typeof ROOM_OS_PUBLISHED_RULE_STATUSES)[number];

/**
 * DB-published Room OS rules — Wave 5 rule store.
 * Append-only version rows; activation/deactivation via status + effective window.
 */
export const roomOsPublishedRules = pgTable(
  'room_os_published_rules',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    ruleId: text('rule_id').notNull(),
    version: integer('version').notNull(),
    scope: text('scope').notNull(),
    scopeRef: uuid('scope_ref'),
    overrideMode: text('override_mode').notNull(),
    description: text('description').notNull(),
    factKey: text('fact_key').notNull(),
    outcome: jsonb('outcome').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').$type<RoomOsPublishedRuleStatus>().notNull().default('active'),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    contentDigest: text('content_digest').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    publishedBy: text('published_by').notNull().default('system'),
    sourceRef: text('source_ref').notNull().default(''),
    supersedesPublicationId: uuid('supersedes_publication_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('room_os_published_rules_scope_status_idx').on(
      t.scope,
      t.scopeRef,
      t.status,
      t.effectiveFrom,
    ),
    index('room_os_published_rules_fact_key_idx').on(t.factKey, t.status),
  ],
);

export type RoomOsPublishedRuleRow = typeof roomOsPublishedRules.$inferSelect;
export type NewRoomOsPublishedRuleRow = typeof roomOsPublishedRules.$inferInsert;

import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const brainIssueStatusEnum = pgEnum('brain_issue_status', [
  'open',
  'repair_available',
  'queued',
  'running',
  'repaired',
  'failed',
  'needs_owner',
  'closed',
]);

export const brainRepairTriggerEnum = pgEnum('brain_repair_trigger', [
  'cron',
  'ui',
  'script',
]);

export const brainIntegrityIssues = pgTable(
  'brain_integrity_issues',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    fingerprint: text('fingerprint').notNull(),
    brain: text('brain').notNull(),
    code: text('code').notNull(),
    severity: text('severity').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    cause: text('cause').notNull(),
    suggestedRepair: text('suggested_repair').notNull(),
    repairFn: text('repair_fn'),
    autoRepairable: boolean('auto_repairable').notNull().default(false),
    status: brainIssueStatusEnum('status').notNull().default('open'),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    repairedAt: timestamp('repaired_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('brain_integrity_issues_fingerprint_uidx').on(t.fingerprint),
    index('brain_integrity_issues_open_idx').on(t.brain, t.status, t.severity),
  ],
);

export const brainRepairRuns = pgTable(
  'brain_repair_runs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    trigger: brainRepairTriggerEnum('trigger').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    queryCount: integer('query_count').notNull().default(0),
    rowsRepaired: integer('rows_repaired').notNull().default(0),
    rowsSkipped: integer('rows_skipped').notNull().default(0),
    rowsFailed: integer('rows_failed').notNull().default(0),
    healthScoreBefore: numeric('health_score_before', { precision: 6, scale: 2 }),
    healthScoreAfter: numeric('health_score_after', { precision: 6, scale: 2 }),
    billingMonth: date('billing_month'),
    summary: jsonb('summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('brain_repair_runs_started_idx').on(t.startedAt)],
);

export const brainRepairEvents = pgTable(
  'brain_repair_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    runId: uuid('run_id')
      .notNull()
      .references(() => brainRepairRuns.id, { onDelete: 'cascade' }),
    issueId: uuid('issue_id').references(() => brainIntegrityIssues.id, {
      onDelete: 'set null',
    }),
    fingerprint: text('fingerprint'),
    repairFn: text('repair_fn').notNull(),
    result: text('result').notNull(),
    error: text('error'),
    durationMs: integer('duration_ms'),
    rowsTouched: integer('rows_touched').notNull().default(0),
    diff: jsonb('diff'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('brain_repair_events_run_idx').on(t.runId, t.createdAt),
    index('brain_repair_events_issue_idx').on(t.issueId, t.createdAt),
  ],
);

export type BrainIntegrityIssue = typeof brainIntegrityIssues.$inferSelect;
export type BrainRepairRun = typeof brainRepairRuns.$inferSelect;
export type BrainRepairEvent = typeof brainRepairEvents.$inferSelect;

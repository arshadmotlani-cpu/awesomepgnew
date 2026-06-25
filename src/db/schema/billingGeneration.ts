import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { bookings } from './bookings';
import { customers } from './customers';
import { pgs } from './pgs';

export const billingGenerationRunStatusEnum = pgEnum('billing_generation_run_status', [
  'running',
  'success',
  'partial',
  'failed',
]);

export const billingGenerationRuns = pgTable(
  'billing_generation_runs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    runDate: date('run_date').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    status: billingGenerationRunStatusEnum('status').notNull().default('running'),
    candidateCount: integer('candidate_count').notNull().default(0),
    createdCount: integer('created_count').notNull().default(0),
    skippedCount: integer('skipped_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    triggeredBy: text('triggered_by').notNull().default('system'),
    summary: jsonb('summary').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [index('billing_generation_runs_run_date_idx').on(t.runDate)],
);

export const billingGenerationFailures = pgTable(
  'billing_generation_failures',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    runId: uuid('run_id')
      .notNull()
      .references(() => billingGenerationRuns.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    pgId: uuid('pg_id').references(() => pgs.id, { onDelete: 'set null' }),
    billingMonth: date('billing_month'),
    errorCode: text('error_code'),
    errorMessage: text('error_message').notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('billing_generation_failures_run_idx').on(t.runId),
    index('billing_generation_failures_unresolved_idx').on(t.resolvedAt),
  ],
);

export type BillingGenerationRun = typeof billingGenerationRuns.$inferSelect;
export type BillingGenerationFailure = typeof billingGenerationFailures.$inferSelect;

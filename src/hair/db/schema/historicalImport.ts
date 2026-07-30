import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { fyhAdminUsers } from './admin';

export const FYH_HISTORICAL_IMPORT_STATUSES = ['running', 'completed', 'failed'] as const;
export type FyhHistoricalImportStatus = (typeof FYH_HISTORICAL_IMPORT_STATUSES)[number];

export type HistoricalImportValidation = {
  passed: boolean;
  excelRowCount: number;
  excelRevenuePaise: number;
  excelCashPaise: number;
  excelUpiPaise: number;
  parsedRowCount: number;
  errors: string[];
};

export type HistoricalImportSummary = {
  totalRows: number;
  imported: number;
  skipped: number;
  failed: number;
  totalRevenuePaise: number;
  totalGstPaise: number;
  cashTotalPaise?: number;
  upiTotalPaise?: number;
  failedRows: Array<{ rowNumber: number; rowKey?: string; reason: string }>;
  validation?: HistoricalImportValidation;
};

export const fyhHistoricalImportBatches = pgTable(
  'fyh_historical_import_batches',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    fileName: text('file_name').notNull(),
    fileSha256: text('file_sha256').notNull(),
    uploadedByAdminId: uuid('uploaded_by_admin_id').references(() => fyhAdminUsers.id, {
      onDelete: 'set null',
    }),
    status: text('status').$type<FyhHistoricalImportStatus>().notNull().default('running'),
    summary: jsonb('summary').$type<HistoricalImportSummary | null>(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fyh_historical_import_batches_sha_idx').on(t.fileSha256, t.status)],
);

export const fyhHistoricalImportRowErrors = pgTable(
  'fyh_historical_import_row_errors',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => fyhHistoricalImportBatches.id, { onDelete: 'cascade' }),
    rowNumber: integer('row_number').notNull(),
    rowKey: text('row_key'),
    errorMessage: text('error_message').notNull(),
    rawRow: jsonb('raw_row').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fyh_historical_import_row_errors_batch_idx').on(t.batchId, t.rowNumber)],
);

export type FyhHistoricalImportBatch = typeof fyhHistoricalImportBatches.$inferSelect;

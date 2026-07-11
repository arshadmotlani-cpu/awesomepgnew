import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { acAssets } from './assets';
import { acExpenses } from './expenses';
import { acPaymentsReceived } from './payments';
import { documentTypeEnum } from './enums';

export const acDocuments = pgTable('ac_documents', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  assetId: uuid('asset_id').references(() => acAssets.id, { onDelete: 'restrict' }),
  expenseId: uuid('expense_id').references(() => acExpenses.id, { onDelete: 'set null' }),
  paymentId: uuid('payment_id').references(() => acPaymentsReceived.id, { onDelete: 'set null' }),
  documentType: documentTypeEnum('document_type').notNull(),
  fileName: text('file_name').notNull(),
  blobPath: text('blob_path').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const acActivityLog = pgTable(
  'ac_activity_log',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    beforeState: jsonb('before_state'),
    afterState: jsonb('after_state'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ac_activity_action_created_idx').on(t.action, t.createdAt),
    index('ac_activity_entity_idx').on(t.entityType, t.entityId),
    index('ac_activity_created_idx').on(t.createdAt),
  ],
);

export const acDrafts = pgTable('ac_drafts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  draftKey: text('draft_key').notNull().unique(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

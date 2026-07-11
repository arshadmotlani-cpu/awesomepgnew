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
import { ledgerDirectionEnum, ledgerEntryTypeEnum } from './enums';

export const acLedgerEntries = pgTable(
  'ac_ledger_entries',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    entryType: ledgerEntryTypeEnum('entry_type').notNull(),
    direction: ledgerDirectionEnum('direction').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    assetId: uuid('asset_id').references(() => acAssets.id, { onDelete: 'restrict' }),
    sourceTable: text('source_table').notNull(),
    sourceId: uuid('source_id').notNull(),
    reversalOfEntryId: uuid('reversal_of_entry_id'),
    description: text('description').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ac_ledger_asset_created_idx').on(t.assetId, t.createdAt),
    index('ac_ledger_type_created_idx').on(t.entryType, t.createdAt),
    index('ac_ledger_source_idx').on(t.sourceTable, t.sourceId),
  ],
);

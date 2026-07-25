import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { acAssets } from './assets';
import { acDocuments } from './documents';
import { acLedgerEntries } from './ledger';
import type { VehicleActivityType } from '@/src/capital/lib/activityTypes';

export const acRepairAdvances = pgTable(
  'ac_repair_advances',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => acAssets.id, { onDelete: 'cascade' }),
    advancePaise: bigint('advance_paise', { mode: 'number' }).notNull(),
    actualCostPaise: bigint('actual_cost_paise', { mode: 'number' }),
    returnedPaise: bigint('returned_paise', { mode: 'number' }).notNull().default(0),
    outstandingPaise: bigint('outstanding_paise', { mode: 'number' }).notNull().default(0),
    status: text('status').$type<'open' | 'settled'>().notNull().default('open'),
    advanceActivityId: uuid('advance_activity_id'),
    settlementActivityId: uuid('settlement_activity_id'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ac_repair_advances_asset_idx').on(t.assetId),
    index('ac_repair_advances_status_idx').on(t.status),
  ],
);

export const acVehicleActivities = pgTable(
  'ac_vehicle_activities',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => acAssets.id, { onDelete: 'cascade' }),
    activityType: text('activity_type').$type<VehicleActivityType>().notNull(),
    activityAt: date('activity_at').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }),
    title: text('title'),
    notes: text('notes'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    documentId: uuid('document_id').references(() => acDocuments.id, { onDelete: 'set null' }),
    ledgerEntryId: uuid('ledger_entry_id').references(() => acLedgerEntries.id, {
      onDelete: 'set null',
    }),
    repairAdvanceId: uuid('repair_advance_id').references(() => acRepairAdvances.id, {
      onDelete: 'set null',
    }),
    isReversed: boolean('is_reversed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ac_vehicle_activities_asset_at_idx').on(t.assetId, t.activityAt),
    index('ac_vehicle_activities_type_idx').on(t.activityType),
  ],
);

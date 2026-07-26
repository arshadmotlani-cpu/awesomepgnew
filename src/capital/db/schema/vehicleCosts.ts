import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { acAssets } from './assets';
import { acVehicleActivities } from './activities';
import { acLedgerEntries } from './ledger';

export const VEHICLE_COST_TYPES = [
  'broker_commission',
  'transport',
  'repair_settlement',
  'fuel',
  'insurance',
  'accessories',
  'washing',
  'service',
  'rto',
  'storage',
  'miscellaneous',
  'refund',
] as const;
export type VehicleCostType = (typeof VEHICLE_COST_TYPES)[number];

/**
 * Vehicle Cost ledger — post-purchase costs that enter TVI.
 * TVI = Purchase Price + Σ amount_paise (signed; refunds negative).
 */
export const acVehicleCosts = pgTable(
  'ac_vehicle_costs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => acAssets.id, { onDelete: 'restrict' }),
    costType: text('cost_type').$type<VehicleCostType>().notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    occurredAt: date('occurred_at').notNull(),
    title: text('title'),
    notes: text('notes'),
    activityId: uuid('activity_id').references(() => acVehicleActivities.id, {
      onDelete: 'set null',
    }),
    ledgerEntryId: uuid('ledger_entry_id').references(() => acLedgerEntries.id, {
      onDelete: 'set null',
    }),
    isReversed: boolean('is_reversed').notNull().default(false),
    reversalOfId: uuid('reversal_of_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ac_vehicle_costs_asset_idx').on(t.assetId),
    index('ac_vehicle_costs_occurred_at_idx').on(t.occurredAt),
    index('ac_vehicle_costs_is_reversed_idx').on(t.isReversed),
  ],
);

import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { acAssets } from './assets';

/** Investor slot on a vehicle — Me + up to two co-investors. */
export const INVESTOR_SLOTS = ['me', 'investor_2', 'investor_3'] as const;
export type InvestorSlot = (typeof INVESTOR_SLOTS)[number];

export const DEFAULT_INVESTOR_LABELS: Record<InvestorSlot, string> = {
  me: 'Me',
  investor_2: 'Investor 2',
  investor_3: 'Investor 3',
};

/**
 * Layer 2 — who funded the vehicle purchase and their profit outcome.
 * Sum of invested_paise for an asset MUST equal purchase_price_paise.
 */
export const acAssetInvestors = pgTable(
  'ac_asset_investors',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => acAssets.id, { onDelete: 'cascade' }),
    slot: text('slot').$type<InvestorSlot>().notNull(),
    label: text('label').notNull(),
    investedPaise: bigint('invested_paise', { mode: 'number' }).notNull(),
    profitPaise: bigint('profit_paise', { mode: 'number' }),
    profitReceivedPaise: bigint('profit_received_paise', { mode: 'number' })
      .notNull()
      .default(0),
    roiBps: integer('roi_bps'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ac_asset_investors_asset_slot_uidx').on(t.assetId, t.slot),
    index('ac_asset_investors_asset_idx').on(t.assetId),
    index('ac_asset_investors_slot_idx').on(t.slot),
  ],
);

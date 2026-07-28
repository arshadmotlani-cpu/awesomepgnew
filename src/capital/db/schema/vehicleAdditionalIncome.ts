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

export const VEHICLE_ADDITIONAL_INCOME_TYPES = [
  'brokerage',
  'finance_commission',
  'insurance_commission',
  'rto_commission',
  'referral_income',
  'dealer_incentive',
  'miscellaneous',
] as const;
export type VehicleAdditionalIncomeType = (typeof VEHICLE_ADDITIONAL_INCOME_TYPES)[number];

export const VEHICLE_ADDITIONAL_INCOME_TYPE_LABELS: Record<VehicleAdditionalIncomeType, string> = {
  brokerage: 'Brokerage',
  finance_commission: 'Finance Commission',
  insurance_commission: 'Insurance Commission',
  rto_commission: 'RTO Commission',
  referral_income: 'Referral Income',
  dealer_incentive: 'Dealer Incentive',
  miscellaneous: 'Miscellaneous',
};

/**
 * Additional Income ledger — earnings outside TVI.
 * Vehicle Profit = Sale − TVI + Σ Additional Income.
 * Never mixed into vehicle costs / Active Capital.
 */
export const acVehicleAdditionalIncome = pgTable(
  'ac_vehicle_additional_income',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => acAssets.id, { onDelete: 'restrict' }),
    incomeType: text('income_type').$type<VehicleAdditionalIncomeType>().notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    occurredAt: date('occurred_at').notNull(),
    notes: text('notes'),
    isReversed: boolean('is_reversed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ac_vehicle_additional_income_asset_idx').on(t.assetId),
    index('ac_vehicle_additional_income_occurred_at_idx').on(t.occurredAt),
  ],
);

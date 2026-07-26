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
import { paymentModeEnum } from './enums';
import { acLedgerEntries } from './ledger';

export const SELLER_PAYMENT_KINDS = ['token', 'purchase', 'final'] as const;
export type SellerPaymentKind = (typeof SELLER_PAYMENT_KINDS)[number];

/**
 * Seller Payments ledger — cash paid toward purchase price.
 * Remaining = Purchase Price − Σ active seller payments.
 * Instrument = how paid (Cash / RTGS / …) — not internal funding sources.
 */
export const acSellerPayments = pgTable(
  'ac_seller_payments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => acAssets.id, { onDelete: 'restrict' }),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    paidAt: date('paid_at').notNull(),
    instrument: paymentModeEnum('instrument').notNull(),
    kind: text('kind').$type<SellerPaymentKind>().notNull(),
    referenceNumber: text('reference_number'),
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
    index('ac_seller_payments_asset_idx').on(t.assetId),
    index('ac_seller_payments_paid_at_idx').on(t.paidAt),
    index('ac_seller_payments_is_reversed_idx').on(t.isReversed),
  ],
);

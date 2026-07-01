import { pgEnum, pgTable, text, timestamp, uuid, bigint, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { bookings } from './bookings';
import { customers } from './customers';

export const referralRedemptionStatusEnum = pgEnum('referral_redemption_status', [
  'pending',
  'applied',
  'voided',
]);

export const referralEarningStatusEnum = pgEnum('referral_earning_status', [
  'locked',
  'available',
  'withdrawn',
  'clawed_back',
]);

export const referralRedemptions = pgTable(
  'referral_redemptions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    referrerCustomerId: uuid('referrer_customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    refereeEmail: text('referee_email').notNull(),
    refereeCustomerId: uuid('referee_customer_id').references(() => customers.id, {
      onDelete: 'set null',
    }),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    discountPaise: bigint('discount_paise', { mode: 'number' }).notNull().default(0),
    status: referralRedemptionStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('referral_redemptions_referee_email_uidx').on(t.refereeEmail),
    index('referral_redemptions_referrer_idx').on(t.referrerCustomerId),
  ],
);

export const referralEarnings = pgTable(
  'referral_earnings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    referrerCustomerId: uuid('referrer_customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    redemptionId: uuid('redemption_id')
      .notNull()
      .references(() => referralRedemptions.id, { onDelete: 'restrict' }),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    status: referralEarningStatusEnum('status').notNull().default('locked'),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('referral_earnings_referrer_idx').on(t.referrerCustomerId)],
);

export type ReferralRedemption = typeof referralRedemptions.$inferSelect;
export type ReferralEarning = typeof referralEarnings.$inferSelect;

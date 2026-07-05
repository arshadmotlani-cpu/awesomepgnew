/**
 * Admin-managed promo coupons (extends date-coupon system).
 */
import { bigint, boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { promoCouponScopeEnum, promoCouponTypeEnum } from './enums';

export const promoCoupons = pgTable(
  'promo_coupons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    type: promoCouponTypeEnum('type').notNull().default('percentage'),
    /** Basis points for percentage coupons (1000 = 10%). */
    percentageBps: integer('percentage_bps'),
    fixedAmountPaise: bigint('fixed_amount_paise', { mode: 'number' }),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validTill: timestamp('valid_till', { withTimezone: true }).notNull(),
    usageLimit: integer('usage_limit'),
    perUserLimit: integer('per_user_limit').notNull().default(1),
    active: boolean('active').notNull().default(true),
    reason: text('reason'),
    scope: promoCouponScopeEnum('scope').notNull().default('booking_rent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('promo_coupons_active_idx').on(t.active),
    index('promo_coupons_scope_idx').on(t.scope),
  ],
);

export type PromoCoupon = typeof promoCoupons.$inferSelect;

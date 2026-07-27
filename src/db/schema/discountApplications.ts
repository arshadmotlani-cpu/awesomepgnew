/**
 * Discount application audit — reserved at booking create, consumed on confirm.
 */
import { bigint, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { bookings } from './bookings';
import { customers } from './customers';
import { payments } from './payments';
import { promoCoupons } from './promoCoupons';
import { rentInvoices } from './rentInvoices';
import { discountApplicationLifecycleEnum, discountTypeEnum } from './enums';

export const discountApplications = pgTable(
  'discount_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    discountType: discountTypeEnum('discount_type').notNull(),
    couponCode: text('coupon_code'),
    referralCode: text('referral_code'),
    originalAmountPaise: bigint('original_amount_paise', { mode: 'number' }).notNull(),
    discountAmountPaise: bigint('discount_amount_paise', { mode: 'number' }).notNull(),
    finalAmountPaise: bigint('final_amount_paise', { mode: 'number' }).notNull(),
    appliedByCustomerId: uuid('applied_by_customer_id').references(() => customers.id, {
      onDelete: 'set null',
    }),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    rentInvoiceId: uuid('rent_invoice_id').references(() => rentInvoices.id, {
      onDelete: 'set null',
    }),
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    reason: text('reason'),
    lifecycleStatus: discountApplicationLifecycleEnum('lifecycle_status')
      .notNull()
      .default('reserved'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    promoCouponId: uuid('promo_coupon_id').references(() => promoCoupons.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    index('discount_applications_booking_idx').on(t.bookingId),
    index('discount_applications_invoice_idx').on(t.rentInvoiceId),
    index('discount_applications_customer_idx').on(t.appliedByCustomerId),
    index('discount_applications_type_idx').on(t.discountType),
    index('discount_applications_lifecycle_idx').on(t.couponCode, t.lifecycleStatus),
    index('discount_applications_booking_lifecycle_idx').on(t.bookingId, t.lifecycleStatus),
    uniqueIndex('discount_applications_active_reserve_unique')
      .on(t.couponCode, t.appliedByCustomerId)
      .where(
        sql`${t.lifecycleStatus} = 'reserved'
          AND ${t.bookingId} IS NOT NULL
          AND ${t.couponCode} IS NOT NULL
          AND ${t.appliedByCustomerId} IS NOT NULL`,
      ),
  ],
);

export type DiscountApplication = typeof discountApplications.$inferSelect;

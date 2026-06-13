import { bigint, date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { bookings } from './bookings';
import { customers } from './customers';

export const couponRedemptions = pgTable(
  'coupon_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    couponCode: text('coupon_code').notNull(),
    couponDate: date('coupon_date').notNull(),
    discountPaise: bigint('discount_paise', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('coupon_redemptions_coupon_date_idx').on(t.couponDate),
    index('coupon_redemptions_booking_idx').on(t.bookingId),
    index('coupon_redemptions_created_at_idx').on(t.createdAt),
  ],
);

export type CouponRedemption = typeof couponRedemptions.$inferSelect;
export type NewCouponRedemption = typeof couponRedemptions.$inferInsert;

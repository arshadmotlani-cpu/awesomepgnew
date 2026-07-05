/**
 * Discount application audit — immutable record of every discount applied.
 */
import { bigint, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { bookings } from './bookings';
import { customers } from './customers';
import { payments } from './payments';
import { rentInvoices } from './rentInvoices';
import { discountTypeEnum } from './enums';

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
  },
  (t) => [
    index('discount_applications_booking_idx').on(t.bookingId),
    index('discount_applications_invoice_idx').on(t.rentInvoiceId),
    index('discount_applications_customer_idx').on(t.appliedByCustomerId),
    index('discount_applications_type_idx').on(t.discountType),
  ],
);

export type DiscountApplication = typeof discountApplications.$inferSelect;

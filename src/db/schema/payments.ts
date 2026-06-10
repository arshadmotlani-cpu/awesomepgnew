import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { bookings } from './bookings';
import { paymentProviderEnum, paymentPurposeEnum, paymentStatusEnum } from './enums';

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    purpose: paymentPurposeEnum('purpose').notNull(),
    provider: paymentProviderEnum('provider').notNull(),
    providerPaymentId: text('provider_payment_id'),
    providerOrderId: text('provider_order_id'),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    currency: text('currency').notNull().default('INR'),
    status: paymentStatusEnum('status').notNull().default('initiated'),
    rawPayload: jsonb('raw_payload'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payments_booking_id_idx').on(t.bookingId),
    index('payments_status_idx').on(t.status),
    // Idempotency: a provider+payment_id pair can only show up once.
    uniqueIndex('payments_provider_payment_id_unique')
      .on(t.provider, t.providerPaymentId)
      .where(sql`provider_payment_id IS NOT NULL`),
  ],
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

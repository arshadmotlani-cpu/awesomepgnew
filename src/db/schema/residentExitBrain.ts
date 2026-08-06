import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { bookings } from './bookings';
import { customers } from './customers';
import { rooms } from './rooms';
import { vacatingRequests } from './vacatingRequests';

export type ResidentExitBrainStatus = 'active' | 'completed';

export type FrozenRentLateFeesJson = Record<string, number>;

export const residentExitBrain = pgTable(
  'resident_exit_brain',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    vacatingRequestId: uuid('vacating_request_id')
      .notNull()
      .references(() => vacatingRequests.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('active').$type<ResidentExitBrainStatus>(),
    activatedAt: timestamp('activated_at', { withTimezone: true }).notNull().defaultNow(),
    noticeGivenDate: date('notice_given_date').notNull(),
    expectedCheckoutDate: date('expected_checkout_date').notNull(),
    frozenNoticePenaltyPaise: bigint('frozen_notice_penalty_paise', { mode: 'number' })
      .notNull()
      .default(0),
    frozenRentLateFeePaise: bigint('frozen_rent_late_fee_paise', { mode: 'number' })
      .notNull()
      .default(0),
    frozenRentLateFeesJson: jsonb('frozen_rent_late_fees_json')
      .notNull()
      .default(sql`'{}'::jsonb`)
      .$type<FrozenRentLateFeesJson>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('resident_exit_brain_booking_active_unique')
      .on(t.bookingId)
      .where(sql`${t.status} = 'active'`),
  ],
);

export type ResidentExitBrainRow = typeof residentExitBrain.$inferSelect;

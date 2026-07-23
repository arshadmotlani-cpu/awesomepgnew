import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';
import { bookings } from './bookings';
import { customers } from './customers';
import { vacatingRequests } from './vacatingRequests';

export const vacatingDateChangeStatusEnum = pgEnum('vacating_date_change_status', [
  'pending',
  'approved',
  'rejected',
  'cancelled',
]);

export type VacatingDateChangeStatus = (typeof vacatingDateChangeStatusEnum.enumValues)[number];

export const vacatingDateChangeRequests = pgTable(
  'vacating_date_change_requests',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    vacatingRequestId: uuid('vacating_request_id')
      .notNull()
      .references(() => vacatingRequests.id, { onDelete: 'restrict' }),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    currentVacatingDate: date('current_vacating_date').notNull(),
    requestedVacatingDate: date('requested_vacating_date').notNull(),
    status: vacatingDateChangeStatusEnum('status').notNull().default('pending'),
    currentEstimatedRefundPaise: bigint('current_estimated_refund_paise', { mode: 'number' })
      .notNull()
      .default(0),
    requestedEstimatedRefundPaise: bigint('requested_estimated_refund_paise', { mode: 'number' })
      .notNull()
      .default(0),
    refundDeltaPaise: bigint('refund_delta_paise', { mode: 'number' }).notNull().default(0),
    previewSnapshot: jsonb('preview_snapshot'),
    residentNotes: text('resident_notes'),
    adminNotes: text('admin_notes'),
    reviewedByAdminId: uuid('reviewed_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('vacating_date_change_one_pending_per_vacating')
      .on(t.vacatingRequestId)
      .where(sql`${t.status} = 'pending'`),
    index('vacating_date_change_booking_idx').on(t.bookingId, t.status),
    index('vacating_date_change_status_idx').on(t.status, t.updatedAt),
  ],
);

export type VacatingDateChangeRequest = typeof vacatingDateChangeRequests.$inferSelect;
export type NewVacatingDateChangeRequest = typeof vacatingDateChangeRequests.$inferInsert;

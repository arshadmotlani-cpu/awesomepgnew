import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';
import { bookings } from './bookings';
import { customers } from './customers';
import { pgs } from './pgs';
import { residentRequestStatusEnum, residentRequestTypeEnum } from './enums';

export const residentRequests = pgTable(
  'resident_requests',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    pgId: uuid('pg_id')
      .notNull()
      .references(() => pgs.id, { onDelete: 'cascade' }),
    type: residentRequestTypeEnum('type').notNull(),
    status: residentRequestStatusEnum('status').notNull().default('submitted'),
    requestedEndDate: date('requested_end_date'),
    amountPaise: bigint('amount_paise', { mode: 'number' }),
    notes: text('notes'),
    adminNotes: text('admin_notes'),
    /** Electricity, damage, and other deductions applied at refund approval. */
    refundDeductions: jsonb('refund_deductions').$type<RefundDeductionsSnapshot>(),
    finalRefundPaise: bigint('final_refund_paise', { mode: 'number' }),
    refundMethod: text('refund_method'),
    refundPaidAt: timestamp('refund_paid_at', { withTimezone: true }),
    resolvedByAdminId: uuid('resolved_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('resident_requests_status_type_idx').on(t.status, t.type, t.createdAt),
    index('resident_requests_booking_idx').on(t.bookingId, t.status),
    uniqueIndex('resident_requests_open_deposit_refund_unique')
      .on(t.bookingId, t.type)
      .where(
        sql`${t.type} = 'deposit_refund' AND ${t.status} IN ('submitted', 'under_review', 'approved')`,
      ),
    uniqueIndex('resident_requests_open_extension_unique')
      .on(t.bookingId, t.type)
      .where(
        sql`${t.type} = 'stay_extension' AND ${t.status} IN ('submitted', 'under_review', 'approved')`,
      ),
  ],
);

export type RefundDeductionsSnapshot = {
  depositHeldPaise: number;
  electricityUnitCostPaise?: number;
  electricityUnits?: number;
  electricityDeductionPaise?: number;
  damageChargePaise?: number;
  cleaningChargePaise?: number;
  penaltyChargePaise?: number;
  customChargePaise?: number;
  customChargeLabel?: string;
  otherDeductionsPaise?: number;
};

export type ResidentRequest = typeof residentRequests.$inferSelect;
export type NewResidentRequest = typeof residentRequests.$inferInsert;

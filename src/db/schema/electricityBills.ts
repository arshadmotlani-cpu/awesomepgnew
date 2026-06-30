import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';
import { electricityBillStatusEnum } from './enums';
import { meterLogs } from './meterLogs';
import { pgs } from './pgs';
import { rooms } from './rooms';

/**
 * One row per (room, billing_month) — the "header" of the electricity
 * billing for that room that month. Per-resident `electricity_invoices`
 * fan out in the same transaction.
 *
 * `monthly_occupant_count = 0` is a valid state — the operator entered
 * usage for a room that had no monthly residents that month. We still
 * keep the bill row so the audit trail captures that the operator
 * recorded readings; no invoices are generated.
 *
 * `per_resident_paise = floor(total_paise / monthly_occupant_count)`.
 * Any rounding remainder (the unsplittable paise) is stored in
 * `rounding_remainder_paise` and absorbed by the operator — never
 * silently dropped, never silently overcharged.
 */
export const electricityBills = pgTable(
  'electricity_bills',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    pgId: uuid('pg_id')
      .notNull()
      .references(() => pgs.id, { onDelete: 'restrict' }),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'restrict' }),
    billingMonth: date('billing_month').notNull(),
    previousReadingUnits: numeric('previous_reading_units', { precision: 10, scale: 2 }).notNull(),
    currentReadingUnits: numeric('current_reading_units', { precision: 10, scale: 2 }).notNull(),
    unitsConsumed: numeric('units_consumed', { precision: 10, scale: 2 }).notNull(),
    ratePerUnitPaise: bigint('rate_per_unit_paise', { mode: 'number' }).notNull(),
    totalPaise: bigint('total_paise', { mode: 'number' }).notNull(),
    monthlyOccupantCount: integer('monthly_occupant_count').notNull(),
    perResidentPaise: bigint('per_resident_paise', { mode: 'number' }).notNull(),
    roundingRemainderPaise: bigint('rounding_remainder_paise', { mode: 'number' })
      .notNull()
      .default(0),
    /** Offline prepaid credit from a previous tenant applied to this bill. */
    prepaidCreditAppliedPaise: bigint('prepaid_credit_applied_paise', { mode: 'number' })
      .notNull()
      .default(0),
    /** Checkout electricity already collected from short-stay residents this month. */
    checkoutCreditAppliedPaise: bigint('checkout_credit_applied_paise', { mode: 'number' })
      .notNull()
      .default(0),
    /** Who paid offline, e.g. "Former tenant Amit — paid cash June 2026". */
    prepaidCreditNote: text('prepaid_credit_note'),
    createdByAdminId: uuid('created_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    billStatus: electricityBillStatusEnum('bill_status').notNull().default('calculated'),
    isEstimated: boolean('is_estimated').notNull().default(false),
    meterImageUrl: text('meter_image_url'),
    startMeterLogId: uuid('start_meter_log_id').references(() => meterLogs.id, {
      onDelete: 'set null',
    }),
    endMeterLogId: uuid('end_meter_log_id').references(() => meterLogs.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    /** UI/payment pipeline verification — excluded from room reconciliation & revenue. */
    isPipelineTest: boolean('is_pipeline_test').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('electricity_bills_room_month_unique')
      .on(t.roomId, t.billingMonth)
      .where(sql`${t.isPipelineTest} = false`),
    index('electricity_bills_pg_month_idx').on(t.pgId, t.billingMonth),
    index('electricity_bills_room_idx').on(t.roomId),
  ],
);

export type ElectricityBill = typeof electricityBills.$inferSelect;
export type NewElectricityBill = typeof electricityBills.$inferInsert;

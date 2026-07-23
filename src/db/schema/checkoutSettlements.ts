import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { adminUsers } from './adminUsers';
import { bookings } from './bookings';
import { customers } from './customers';
import { depositSettlements } from './depositSettlements';
import { checkoutSettlementStatusEnum, type CheckoutSettlementStatus } from './enums';
import type { RefundDeductionsSnapshot } from './residentRequests';
import { vacatingRequests } from './vacatingRequests';

export const checkoutSettlements = pgTable(
  'checkout_settlements',
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
    status: checkoutSettlementStatusEnum('status')
      .notNull()
      .default('awaiting_resident_details'),
    noticeRequiredDays: integer('notice_required_days').notNull().default(14),
    noticeGivenDays: integer('notice_given_days').notNull().default(0),
    noticeShortfallDays: integer('notice_shortfall_days').notNull().default(0),
    noticeDeductionPaise: bigint('notice_deduction_paise', { mode: 'number' }).notNull().default(0),
    noticeRentCoveredDays: integer('notice_rent_covered_days').notNull().default(0),
    noticeChargeableDays: integer('notice_chargeable_days').notNull().default(0),
    noticeBreakdownJson: jsonb('notice_breakdown_json'),
    monthlyRentPaiseSnapshot: bigint('monthly_rent_paise_snapshot', { mode: 'number' })
      .notNull()
      .default(0),
    depositRequiredPaise: bigint('deposit_required_paise', { mode: 'number' }).notNull().default(0),
    depositReceivedPaise: bigint('deposit_received_paise', { mode: 'number' }).notNull().default(0),
    electricityMeterPhotoUrl: text('electricity_meter_photo_url'),
    electricityUseAverage: boolean('electricity_use_average').notNull().default(false),
    electricityPreviousReading: numeric('electricity_previous_reading', {
      precision: 12,
      scale: 2,
    }),
    electricityCurrentReading: numeric('electricity_current_reading', {
      precision: 12,
      scale: 2,
    }),
    electricityUnits: numeric('electricity_units', { precision: 12, scale: 2 }),
    electricityOccupants: integer('electricity_occupants'),
    electricityUnitRatePaise: bigint('electricity_unit_rate_paise', { mode: 'number' }),
    electricitySharePaise: bigint('electricity_share_paise', { mode: 'number' }).notNull().default(0),
    electricityDeductFromDeposit: boolean('electricity_deduct_from_deposit').notNull().default(true),
    electricityCalculationMethod: text('electricity_calculation_method')
      .notNull()
      .default('meter_reading'),
    autoDetectedSharingCount: integer('auto_detected_sharing_count'),
    electricitySharingOverride: boolean('electricity_sharing_override').notNull().default(false),
    averageBillPaise: bigint('average_bill_paise', { mode: 'number' }),
    manualChargePaise: bigint('manual_charge_paise', { mode: 'number' }),
    meterPhotoMissing: boolean('meter_photo_missing').notNull().default(false),
    damageChargePaise: bigint('damage_charge_paise', { mode: 'number' }).notNull().default(0),
    cleaningChargePaise: bigint('cleaning_charge_paise', { mode: 'number' }).notNull().default(0),
    customChargePaise: bigint('custom_charge_paise', { mode: 'number' }).notNull().default(0),
    customChargeLabel: text('custom_charge_label'),
    payoutUpiId: text('payout_upi_id'),
    payoutQrUrl: text('payout_qr_url'),
    deductionsSnapshot: jsonb('deductions_snapshot').$type<RefundDeductionsSnapshot>(),
    finalRefundPaise: bigint('final_refund_paise', { mode: 'number' }),
    amountsLocked: boolean('amounts_locked').notNull().default(false),
    refundMethod: text('refund_method'),
    refundReference: text('refund_reference'),
    refundNotes: text('refund_notes'),
    refundPaidAt: timestamp('refund_paid_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedByAdminId: uuid('approved_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    refundPaidByAdminId: uuid('refund_paid_by_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    depositSettlementId: uuid('deposit_settlement_id').references(() => depositSettlements.id, {
      onDelete: 'set null',
    }),
    checkoutSource: text('checkout_source').notNull().default('resident_vacating'),
    settlementEngineVersion: integer('settlement_engine_version').notNull().default(1),
    stayCheckInDate: date('stay_check_in_date'),
    stayCheckoutDate: date('stay_checkout_date'),
    stayDays: integer('stay_days'),
    rentPaidPaise: bigint('rent_paid_paise', { mode: 'number' }).notNull().default(0),
    rentConsumedPaise: bigint('rent_consumed_paise', { mode: 'number' }).notNull().default(0),
    unusedRentPaise: bigint('unused_rent_paise', { mode: 'number' }).notNull().default(0),
    noticeDeductionFullPaise: bigint('notice_deduction_full_paise', { mode: 'number' })
      .notNull()
      .default(0),
    noticeFromUnusedRentPaise: bigint('notice_from_unused_rent_paise', { mode: 'number' })
      .notNull()
      .default(0),
    noticeFromDepositPaise: bigint('notice_from_deposit_paise', { mode: 'number' })
      .notNull()
      .default(0),
    unusedRentAfterNoticePaise: bigint('unused_rent_after_notice_paise', { mode: 'number' })
      .notNull()
      .default(0),
    electricityFromDepositPaise: bigint('electricity_from_deposit_paise', { mode: 'number' })
      .notNull()
      .default(0),
    otherFromDepositPaise: bigint('other_from_deposit_paise', { mode: 'number' }).notNull().default(0),
    depositRefundablePaise: bigint('deposit_refundable_paise', { mode: 'number' }),
    unusedRentRefundPaise: bigint('unused_rent_refund_paise', { mode: 'number' }).notNull().default(0),
    totalRefundPaise: bigint('total_refund_paise', { mode: 'number' }),
    settlementWaterfallJson: jsonb('settlement_waterfall_json').$type<CheckoutSettlementWaterfall>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('checkout_settlements_status_idx').on(t.status, t.updatedAt),
    index('checkout_settlements_booking_idx').on(t.bookingId),
    index('checkout_settlements_customer_idx').on(t.customerId),
  ],
);

export type CheckoutSettlement = typeof checkoutSettlements.$inferSelect;
export type NewCheckoutSettlement = typeof checkoutSettlements.$inferInsert;

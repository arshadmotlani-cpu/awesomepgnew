/**
 * Unified Checkout Settlement — single workflow for vacating money + occupancy.
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bedReservations,
  beds,
  bookings,
  checkoutSettlements,
  type CheckoutSettlement,
  floors,
  pgs,
  rooms,
  vacatingRequests,
} from '@/src/db/schema';
import type { CheckoutSettlementStatus } from '@/src/db/schema/enums';
import type { RefundDeductionsSnapshot } from '@/src/db/schema/residentRequests';
import type { AdminSession } from '@/src/lib/auth/session';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import type { CheckoutSource } from '@/src/lib/checkout/checkoutSource';
import { diffDays, formatDate, parseDate, todayString } from '@/src/lib/dates';
import { asPlainNumber } from '@/src/lib/format';
import {
  DEPOSIT_REFUND_MISSING_DETAILS_MESSAGE,
  validateDepositRefundSubmission,
} from '@/src/lib/billing/depositRefundRequirements';
import {
  firstOfMonth,
  noticeShortfallDays,
  VACATING_NOTICE_MIN_DAYS,
} from '@/src/services/billing';
import { computeNoticeDeductionForBooking } from '@/src/services/noticeDeduction';
import { noticeDeductionLedgerReason } from '@/src/lib/vacating/noticeDeductionEngine';
import type { NoticeDeductionBreakdown } from '@/src/lib/vacating/noticeDeductionEngine';
import { isFixedStayDurationMode } from '@/src/lib/checkout/checkoutWorkflow';
import { noticeDeductionAppliesToBooking } from '@/src/lib/checkout/noticeDeductionPolicy';
import { hasCheckoutElectricityEvidence } from '@/src/lib/checkout/checkoutElectricityEvidence';
import {
  enrichCheckoutSettlementImageEvidence,
  type CheckoutSettlementImageEvidence,
} from '@/src/lib/checkout/checkoutSettlementImages';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { computeCheckoutRefundPreview } from '@/src/lib/billing/checkoutRefundPreview';
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';
import {
  applyDepositDeductionsInTx,
  settleDepositRefund,
} from '@/src/services/depositSettlement';
import { finalizeVacatingOccupancy } from '@/src/services/vacating';
import { scheduleAdminNotificationSync } from '@/src/services/adminLiveSync';
import {
  getRoomElectricityLedgerCycle,
  recordCheckoutElectricityCollectionFromSettlementId,
  type RoomElectricityLedgerCycleView,
} from '@/src/services/roomElectricityLedger';
import { buildRoomElectricityCheckoutAllocation } from '@/src/services/roomElectricityCheckout';
import type { RoomElectricityCheckoutAllocation } from '@/src/lib/checkout/roomElectricityAllocation';
import { assessCheckoutSettlementReadiness } from '@/src/lib/checkout/checkoutSettlementReadiness';
import {
  calculateAverageBillingElectricity,
  calculateCheckoutElectricity,
  calculateManualElectricityCharge,
  defaultElectricityRatePaise,
  effectiveSharingCount,
  bookingRoomId,
  resolveRoomOccupancyContext,
  type RoomOccupancyContext,
} from '@/src/lib/checkout/electricitySettlement';
import {
  resolveCheckoutElectricityDeductionPaise,
  resolveCheckoutElectricitySharePaise,
} from '@/src/lib/checkout/electricitySettlementCalc';
import type { ElectricityCalculationMethod } from '@/src/lib/checkout/electricitySettlementCalc';

/** Statuses shown in operational queues (excludes archived). */
const OPERATIONAL_SETTLEMENT_STATUSES: CheckoutSettlementStatus[] = [
  'awaiting_resident_details',
  'awaiting_admin_review',
  'approved',
  'refund_pending',
  'refund_paid',
  'completed',
];

export type CheckoutSettlementListTab =
  | 'awaiting_resident'
  | 'awaiting_review'
  | 'approved'
  | 'refund_pending'
  | 'completed'
  | 'archived';

const TAB_STATUS: Record<CheckoutSettlementListTab, CheckoutSettlementStatus[]> = {
  awaiting_resident: ['awaiting_resident_details'],
  awaiting_review: ['awaiting_admin_review'],
  approved: ['approved'],
  refund_pending: ['refund_pending'],
  completed: ['refund_paid', 'completed'],
  archived: ['archived'],
};

/** Raw SQL bigint columns arrive as strings — coerce before any arithmetic. */
function paiseField(value: unknown): number {
  return asPlainNumber(value);
}

export type CheckoutSettlementRow = CheckoutSettlement & {
  customerName: string;
  customerPhone: string;
  bookingCode: string;
  pgName: string;
  roomNumber: string;
  roomId: string | null;
  bedCode: string;
  vacatingDate: string;
};

export type CheckoutSettlementDetail = CheckoutSettlementRow & {
  stayType: string | null;
  durationMode: string | null;
  depositCollectedPaise: number;
  depositDeductedPaise: number;
  depositRefundedPaise: number;
  depositRefundablePaise: number;
  moveInDate: string | null;
  noticeGivenDate: string;
  roomMonthlyOccupants: number;
  roomOccupancy: RoomOccupancyContext;
  electricityTotalBillPaise: number;
  effectiveSharingCount: number;
  roomElectricityAllocation: RoomElectricityCheckoutAllocation | null;
  roomElectricityLedger: RoomElectricityLedgerCycleView | null;
  meterPhotoEvidence: CheckoutSettlementImageEvidence;
  refundQrEvidence: CheckoutSettlementImageEvidence;
  creditBalancePaise: number;
  preview: RefundDeductionsSnapshot & {
    finalRefundPaise: number;
    totalDeductionsPaise: number;
    noticeDeductionPaise: number;
    electricityDeductionPaise: number;
    outstandingRentDeductionPaise: number;
    electricityDeductFromDeposit: boolean;
    electricitySharePaise: number;
  };
};

export { hasCheckoutElectricityEvidence } from '@/src/lib/checkout/checkoutElectricityEvidence';

export type CheckoutSettlementDeductionInput = {
  noticeDeductionPaise: number;
  noticeShortfallDays: number;
  noticeChargeableDays?: number;
  noticeRentCoveredDays?: number;
  electricitySharePaise: number;
  electricityDeductFromDeposit: boolean;
  damageChargePaise: number;
  cleaningChargePaise: number;
  customChargePaise: number;
  customChargeLabel?: string | null;
};

/** Deduction rows written to deposit_ledger at checkout approval. */
export function buildCheckoutSettlementDeductionPlan(
  row: CheckoutSettlementDeductionInput,
): Array<{ amountPaise: number; reason: string }> {
  const deductions: Array<{ amountPaise: number; reason: string }> = [];
  if (row.noticeDeductionPaise > 0) {
    const chargeable = row.noticeChargeableDays ?? row.noticeShortfallDays;
    const covered = row.noticeRentCoveredDays ?? 0;
    const coveredSuffix =
      covered > 0
        ? ` (${covered} day${covered === 1 ? '' : 's'} satisfied by unused prepaid rent)`
        : '';
    deductions.push({
      amountPaise: row.noticeDeductionPaise,
      reason:
        chargeable > 0
          ? `Notice period fee (${chargeable} chargeable day${chargeable === 1 ? '' : 's'} rent${coveredSuffix})`
          : 'Notice period fee',
    });
  }
  if (row.electricitySharePaise > 0 && row.electricityDeductFromDeposit) {
    deductions.push({
      amountPaise: row.electricitySharePaise,
      reason: 'Electricity share at checkout',
    });
  }
  if (row.damageChargePaise > 0) {
    deductions.push({ amountPaise: row.damageChargePaise, reason: 'Damage charge' });
  }
  if (row.cleaningChargePaise > 0) {
    deductions.push({ amountPaise: row.cleaningChargePaise, reason: 'Cleaning charge' });
  }
  if (row.customChargePaise > 0) {
    deductions.push({
      amountPaise: row.customChargePaise,
      reason: row.customChargeLabel ?? 'Custom charge',
    });
  }
  return deductions;
}

export function checkoutSettlementRequiresLedgerDeductions(
  row: CheckoutSettlementDeductionInput,
): boolean {
  return buildCheckoutSettlementDeductionPlan(row).length > 0;
}

async function resolvePolicyNoticeFields(args: {
  bookingId: string;
  monthlyRentPaiseSnapshot: number;
  noticeGivenDate: string;
  vacatingDate: string;
  stayType?: string | null;
  durationMode?: string | null;
}): Promise<{
  noticeGivenDays: number;
  noticeShortfallDays: number;
  noticeDeductionPaise: number;
  noticeRentCoveredDays: number;
  noticeChargeableDays: number;
  noticeBreakdownJson: Record<string, unknown> | null;
}> {
  const noticeGivenDays = diffDays(args.noticeGivenDate, args.vacatingDate);
  const applies = noticeDeductionAppliesToBooking({
    stayType: args.stayType,
    durationMode: args.durationMode,
  });
  if (!applies) {
    return {
      noticeGivenDays,
      noticeShortfallDays: 0,
      noticeDeductionPaise: 0,
      noticeRentCoveredDays: 0,
      noticeChargeableDays: 0,
      noticeBreakdownJson: null,
    };
  }

  const breakdown = await computeNoticeDeductionForBooking({
    bookingId: args.bookingId,
    noticeGivenDate: args.noticeGivenDate,
    vacatingDate: args.vacatingDate,
    monthlyRentPaise: args.monthlyRentPaiseSnapshot,
    stayType: args.stayType,
    durationMode: args.durationMode,
  });

  return {
    noticeGivenDays,
    noticeShortfallDays: breakdown.missingNoticeDays,
    noticeDeductionPaise: breakdown.noticeDeductionPaise,
    noticeRentCoveredDays: breakdown.rentCoveredDays,
    noticeChargeableDays: breakdown.chargeableNoticeDays,
    noticeBreakdownJson: breakdown as unknown as Record<string, unknown>,
  };
}

/** Repair open settlements still on the legacy fixed 5-day notice formula. */
async function reconcileCheckoutSettlementNoticePolicy(
  settlement: CheckoutSettlement,
  noticeGivenDate: string,
  vacatingDate: string,
  booking?: { stayType?: string | null; durationMode?: string | null },
): Promise<CheckoutSettlement> {
  if (settlement.amountsLocked) return settlement;
  if (!['awaiting_resident_details', 'awaiting_admin_review'].includes(settlement.status)) {
    return settlement;
  }

  const policy = await resolvePolicyNoticeFields({
    bookingId: settlement.bookingId,
    monthlyRentPaiseSnapshot: settlement.monthlyRentPaiseSnapshot,
    noticeGivenDate,
    vacatingDate,
    stayType: booking?.stayType,
    durationMode: booking?.durationMode,
  });

  if (
    settlement.noticeDeductionPaise === policy.noticeDeductionPaise &&
    (settlement.noticeChargeableDays ?? 0) === policy.noticeChargeableDays
  ) {
    return settlement;
  }

  await db
    .update(checkoutSettlements)
    .set({
      noticeGivenDays: policy.noticeGivenDays,
      noticeShortfallDays: policy.noticeShortfallDays,
      noticeDeductionPaise: policy.noticeDeductionPaise,
      noticeRentCoveredDays: policy.noticeRentCoveredDays,
      noticeChargeableDays: policy.noticeChargeableDays,
      noticeBreakdownJson: policy.noticeBreakdownJson,
      updatedAt: new Date(),
    })
    .where(eq(checkoutSettlements.id, settlement.id));

  return {
    ...settlement,
    noticeGivenDays: policy.noticeGivenDays,
    noticeShortfallDays: policy.noticeShortfallDays,
    noticeDeductionPaise: policy.noticeDeductionPaise,
    noticeRentCoveredDays: policy.noticeRentCoveredDays,
    noticeChargeableDays: policy.noticeChargeableDays,
    noticeBreakdownJson: policy.noticeBreakdownJson,
  };
}

function hasResidentRefundDetails(
  row: CheckoutSettlement,
  expectedRefundPaise: number,
): boolean {
  if (!hasCheckoutElectricityEvidence(row)) return false;
  if (expectedRefundPaise <= 0) return true;
  return Boolean(row.payoutUpiId?.trim()) || Boolean(row.payoutQrUrl?.trim());
}

function buildPreview(
  row: CheckoutSettlement,
  depositHeldPaise: number,
  outstandingRentAtCheckoutPaise = 0,
) {
  const held = paiseField(depositHeldPaise);
  const noticeDeductionPaise = paiseField(row.noticeDeductionPaise);
  const electricitySharePaise = resolveCheckoutElectricitySharePaise(row);
  const electricityDeductFromDeposit = row.electricityDeductFromDeposit !== false;
  const damageChargePaise = paiseField(row.damageChargePaise);
  const cleaningChargePaise = paiseField(row.cleaningChargePaise);
  const customChargePaise = paiseField(row.customChargePaise);

  const computed = computeCheckoutRefundPreview({
    depositHeldPaise: held,
    noticeDeductionPaise,
    electricitySharePaise,
    electricityDeductFromDeposit,
    damageChargePaise,
    cleaningChargePaise,
    customChargePaise,
    outstandingRentAtCheckoutPaise,
    finalRefundPaise: row.finalRefundPaise,
    amountsLocked: row.amountsLocked ?? false,
  });

  return {
    depositHeldPaise: held,
    noticeDeductionPaise,
    electricityDeductionPaise: computed.electricityDeductionPaise,
    electricitySharePaise,
    electricityDeductFromDeposit,
    outstandingRentDeductionPaise: computed.outstandingRentDeductionPaise,
    damageChargePaise,
    cleaningChargePaise,
    penaltyChargePaise: noticeDeductionPaise,
    customChargePaise,
    customChargeLabel: row.customChargeLabel ?? undefined,
    totalDeductionsPaise: computed.totalDeductionsPaise,
    finalRefundPaise: computed.finalRefundPaise,
  };
}

type SettlementJoinRow = {
  id: string;
  vacating_request_id: string;
  booking_id: string;
  customer_id: string;
  status: CheckoutSettlementStatus;
  notice_required_days: number;
  notice_given_days: number;
  notice_shortfall_days: number;
  notice_deduction_paise: number;
  notice_rent_covered_days: number;
  notice_chargeable_days: number;
  notice_breakdown_json: NoticeDeductionBreakdown | null;
  deposit_received_paise: number;
  monthly_rent_paise_snapshot: number;
  deposit_required_paise: number;
  electricity_meter_photo_url: string | null;
  electricity_use_average: boolean;
  electricity_previous_reading: string | null;
  electricity_current_reading: string | null;
  electricity_units: string | null;
  electricity_occupants: number | null;
  electricity_unit_rate_paise: number | null;
  electricity_share_paise: number;
  electricity_deduct_from_deposit: boolean;
  electricity_calculation_method: ElectricityCalculationMethod;
  auto_detected_sharing_count: number | null;
  electricity_sharing_override: boolean;
  average_bill_paise: number | null;
  manual_charge_paise: number | null;
  meter_photo_missing: boolean;
  damage_charge_paise: number;
  cleaning_charge_paise: number;
  custom_charge_paise: number;
  custom_charge_label: string | null;
  payout_upi_id: string | null;
  payout_qr_url: string | null;
  deductions_snapshot: RefundDeductionsSnapshot | null;
  final_refund_paise: number | null;
  amounts_locked: boolean;
  refund_method: string | null;
  refund_reference: string | null;
  refund_notes: string | null;
  refund_paid_at: Date | null;
  approved_at: Date | null;
  approved_by_admin_id: string | null;
  refund_paid_by_admin_id: string | null;
  deposit_settlement_id: string | null;
  checkout_source: string;
  created_at: Date;
  updated_at: Date;
  customer_name: string;
  customer_phone: string;
  booking_code: string;
  stay_type: string | null;
  duration_mode: string | null;
  pg_name: string;
  pg_id: string;
  room_number: string;
  room_id: string | null;
  bed_code: string;
  vacating_date: string;
  notice_given_date: string;
  move_in_date: string | null;
};

function mapDbSettlement(row: SettlementJoinRow): CheckoutSettlement {
  return {
    id: row.id,
    vacatingRequestId: row.vacating_request_id,
    bookingId: row.booking_id,
    customerId: row.customer_id,
    status: row.status,
    noticeRequiredDays: asPlainNumber(row.notice_required_days),
    noticeGivenDays: asPlainNumber(row.notice_given_days),
    noticeShortfallDays: asPlainNumber(row.notice_shortfall_days),
    noticeDeductionPaise: paiseField(row.notice_deduction_paise),
    noticeRentCoveredDays: asPlainNumber(row.notice_rent_covered_days ?? 0),
    noticeChargeableDays: asPlainNumber(row.notice_chargeable_days ?? 0),
    noticeBreakdownJson: row.notice_breakdown_json,
    monthlyRentPaiseSnapshot: paiseField(row.monthly_rent_paise_snapshot),
    depositRequiredPaise: paiseField(row.deposit_required_paise),
    depositReceivedPaise: paiseField(row.deposit_received_paise ?? 0),
    electricityMeterPhotoUrl: row.electricity_meter_photo_url,
    electricityUseAverage: row.electricity_use_average,
    electricityPreviousReading: row.electricity_previous_reading,
    electricityCurrentReading: row.electricity_current_reading,
    electricityUnits: row.electricity_units,
    electricityOccupants: row.electricity_occupants,
    electricityUnitRatePaise: row.electricity_unit_rate_paise
      ? paiseField(row.electricity_unit_rate_paise)
      : null,
    electricitySharePaise: paiseField(row.electricity_share_paise),
    electricityDeductFromDeposit: row.electricity_deduct_from_deposit !== false,
    electricityCalculationMethod:
      (row.electricity_calculation_method as ElectricityCalculationMethod) ?? 'meter_reading',
    autoDetectedSharingCount: row.auto_detected_sharing_count,
    electricitySharingOverride: row.electricity_sharing_override === true,
    averageBillPaise: row.average_bill_paise != null ? paiseField(row.average_bill_paise) : null,
    manualChargePaise: row.manual_charge_paise != null ? paiseField(row.manual_charge_paise) : null,
    meterPhotoMissing: row.meter_photo_missing === true,
    damageChargePaise: paiseField(row.damage_charge_paise),
    cleaningChargePaise: paiseField(row.cleaning_charge_paise),
    customChargePaise: paiseField(row.custom_charge_paise),
    customChargeLabel: row.custom_charge_label,
    payoutUpiId: row.payout_upi_id,
    payoutQrUrl: row.payout_qr_url,
    deductionsSnapshot: row.deductions_snapshot,
    finalRefundPaise: row.final_refund_paise != null ? paiseField(row.final_refund_paise) : null,
    amountsLocked: row.amounts_locked,
    refundMethod: row.refund_method,
    refundReference: row.refund_reference,
    refundNotes: row.refund_notes,
    refundPaidAt: row.refund_paid_at,
    approvedAt: row.approved_at,
    approvedByAdminId: row.approved_by_admin_id,
    refundPaidByAdminId: row.refund_paid_by_admin_id,
    depositSettlementId: row.deposit_settlement_id,
    checkoutSource: row.checkout_source ?? 'resident_vacating',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapJoinRow(row: SettlementJoinRow): CheckoutSettlementRow {
  return {
    ...mapDbSettlement(row),
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    bookingCode: row.booking_code,
    pgName: row.pg_name ?? '—',
    roomNumber: row.room_number ?? '—',
    roomId: row.room_id ?? null,
    bedCode: row.bed_code ?? '—',
    vacatingDate: row.vacating_date,
  };
}

async function loadSettlementRow(
  settlementId: string,
): Promise<(SettlementJoinRow & CheckoutSettlementRow) | null> {
  const rows = await db.execute<SettlementJoinRow>(sql`
    SELECT
      cs.*,
      c.full_name AS customer_name,
      c.phone AS customer_phone,
      b.booking_code AS booking_code,
      b.stay_type AS stay_type,
      b.duration_mode AS duration_mode,
      loc.pg_name,
      loc.pg_id,
      loc.room_number,
      loc.room_id,
      loc.bed_code,
      vr.vacating_date AS vacating_date,
      vr.notice_given_date AS notice_given_date,
      (
        SELECT to_char(lower(br2.stay_range), 'YYYY-MM-DD')
        FROM bed_reservations br2
        WHERE br2.booking_id = cs.booking_id AND br2.kind = 'primary'
        ORDER BY br2.created_at DESC
        LIMIT 1
      ) AS move_in_date
    FROM checkout_settlements cs
    INNER JOIN customers c ON c.id = cs.customer_id
    INNER JOIN bookings b ON b.id = cs.booking_id
    INNER JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
      AND vr.checkout_settlement_suppressed = false
    LEFT JOIN LATERAL (
      SELECT
        bd.bed_code,
        r.id::text AS room_id,
        r.room_number,
        p.id::text AS pg_id,
        p.name AS pg_name
      FROM bed_reservations br
      INNER JOIN beds bd ON bd.id = br.bed_id
      INNER JOIN rooms r ON r.id = bd.room_id
      INNER JOIN floors f ON f.id = r.floor_id
      INNER JOIN pgs p ON p.id = f.pg_id
      WHERE br.booking_id = cs.booking_id
        AND br.kind = 'primary'
      ORDER BY br.created_at DESC
      LIMIT 1
    ) loc ON true
    WHERE cs.id = ${settlementId}::uuid
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) return null;
  return { ...row, ...mapJoinRow(row) };
}

export async function createCheckoutSettlementFromVacating(input: {
  vacatingRequestId: string;
  checkoutSource?: string;
}): Promise<{ ok: true; settlementId: string } | { ok: false; error: string }> {
  const [vr] = await db
    .select()
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, input.vacatingRequestId))
    .limit(1);
  if (!vr) return { ok: false, error: 'Vacating request not found.' };
  if (vr.checkoutSettlementSuppressed) {
    return { ok: false, error: 'Checkout settlement is suppressed for this vacating request.' };
  }

  const [existing] = await db
    .select({ id: checkoutSettlements.id })
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.vacatingRequestId, vr.id))
    .limit(1);
  if (existing) return { ok: true, settlementId: existing.id };

  const [existingForBooking] = await db
    .select({ id: checkoutSettlements.id })
    .from(checkoutSettlements)
    .where(
      and(
        eq(checkoutSettlements.bookingId, vr.bookingId),
        inArray(checkoutSettlements.status, [
          'awaiting_resident_details',
          'awaiting_admin_review',
          'refund_pending',
          'approved',
        ]),
      ),
    )
    .limit(1);
  if (existingForBooking) {
    return { ok: true, settlementId: existingForBooking.id };
  }

  const [booking] = await db
    .select({
      depositPaise: bookings.depositPaise,
      stayType: bookings.stayType,
      durationMode: bookings.durationMode,
    })
    .from(bookings)
    .where(eq(bookings.id, vr.bookingId))
    .limit(1);

  const policy = await resolvePolicyNoticeFields({
    bookingId: vr.bookingId,
    monthlyRentPaiseSnapshot: vr.monthlyRentPaiseSnapshot,
    noticeGivenDate: vr.noticeGivenDate,
    vacatingDate: vr.vacatingDate,
    stayType: booking?.stayType,
    durationMode: booking?.durationMode,
  });

  const wallet = await getDepositSummaryForBooking(vr.bookingId);
  const depositReceivedPaise = wallet?.collectedPaise ?? 0;

  const [created] = await db
    .insert(checkoutSettlements)
    .values({
      vacatingRequestId: vr.id,
      bookingId: vr.bookingId,
      customerId: vr.customerId,
      status: 'awaiting_resident_details',
      checkoutSource: input.checkoutSource ?? 'resident_vacating',
      noticeRequiredDays: VACATING_NOTICE_MIN_DAYS,
      noticeGivenDays: policy.noticeGivenDays,
      noticeShortfallDays: policy.noticeShortfallDays,
      noticeDeductionPaise: policy.noticeDeductionPaise,
      noticeRentCoveredDays: policy.noticeRentCoveredDays,
      noticeChargeableDays: policy.noticeChargeableDays,
      noticeBreakdownJson: policy.noticeBreakdownJson,
      monthlyRentPaiseSnapshot: vr.monthlyRentPaiseSnapshot,
      depositRequiredPaise: booking?.depositPaise ?? 0,
      depositReceivedPaise,
    })
    .returning({ id: checkoutSettlements.id });

  await db
    .update(bookings)
    .set({ depositDuePaise: 0, updatedAt: new Date() })
    .where(eq(bookings.id, vr.bookingId));

  await db.insert(auditLog).values({
    actorType: 'system',
    entity: 'checkout_settlement',
    entityId: created.id,
    action: 'created',
    diff: { vacatingRequestId: vr.id, bookingId: vr.bookingId },
  });

  scheduleAdminNotificationSync();
  return { ok: true, settlementId: created.id };
}

function monthlyRentFromBookingSnapshot(snapshot: PricingSnapshot | null): number {
  if (!snapshot || !Array.isArray(snapshot.perBed)) return 0;
  return snapshot.perBed.reduce((acc, bed) => acc + (bed.monthlyRatePaise ?? 0), 0);
}

async function resolveEmergencyVacatingDate(bookingId: string, fallback: string): Promise<string> {
  const [reservationEnd] = await db.execute<{ end_date: string | null }>(sql`
    SELECT to_char(max(upper(br.stay_range)), 'YYYY-MM-DD') AS end_date
    FROM bed_reservations br
    WHERE br.booking_id = ${bookingId}::uuid
      AND br.kind = 'primary'
  `);
  const upper = reservationEnd?.end_date;
  if (upper && upper !== 'infinity' && /^\d{4}-\d{2}-\d{2}$/.test(upper)) {
    const end = parseDate(upper);
    end.setUTCDate(end.getUTCDate() - 1);
    return formatDate(end);
  }
  return fallback;
}

/**
 * Idempotent — ensures a completed vacating row + open checkout settlement exist
 * for admin/emergency checkouts and completed bookings missing refund artifacts.
 */
export async function ensureEmergencyCheckoutForBooking(input: {
  bookingId: string;
  customerId: string;
  checkoutSource?: CheckoutSource;
  resolvedByAdminId?: string | null;
  notes?: string | null;
}): Promise<
  | { ok: true; settlementId: string; vacatingRequestId: string; created: boolean }
  | { ok: false; error: string }
> {
  const checkoutSource = input.checkoutSource ?? 'emergency_checkout';

  const [existingSettlement] = await db
    .select({ id: checkoutSettlements.id })
    .from(checkoutSettlements)
    .where(
      and(
        eq(checkoutSettlements.bookingId, input.bookingId),
        eq(checkoutSettlements.customerId, input.customerId),
        sql`${checkoutSettlements.status} <> 'archived'`,
      ),
    )
    .orderBy(desc(checkoutSettlements.updatedAt))
    .limit(1);
  if (existingSettlement) {
    const [vr] = await db
      .select({ id: vacatingRequests.id })
      .from(vacatingRequests)
      .where(eq(vacatingRequests.bookingId, input.bookingId))
      .orderBy(desc(vacatingRequests.updatedAt))
      .limit(1);
    return {
      ok: true,
      settlementId: existingSettlement.id,
      vacatingRequestId: vr?.id ?? '',
      created: false,
    };
  }

  const [booking] = await db
    .select({
      id: bookings.id,
      customerId: bookings.customerId,
      status: bookings.status,
      depositPaise: bookings.depositPaise,
      expectedCheckoutDate: bookings.expectedCheckoutDate,
      createdAt: bookings.createdAt,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(
      and(eq(bookings.id, input.bookingId), eq(bookings.customerId, input.customerId)),
    )
    .limit(1);
  if (!booking) return { ok: false, error: 'Booking not found.' };
  if (booking.status !== 'confirmed' && booking.status !== 'completed') {
    return { ok: false, error: 'Booking is not eligible for emergency checkout.' };
  }

  let vacatingRequestId: string | null = null;

  const [usableVacating] = await db
    .select({ id: vacatingRequests.id, status: vacatingRequests.status })
    .from(vacatingRequests)
    .where(
      and(
        eq(vacatingRequests.bookingId, input.bookingId),
        inArray(vacatingRequests.status, ['approved', 'completed']),
      ),
    )
    .orderBy(desc(vacatingRequests.updatedAt))
    .limit(1);

  if (usableVacating) {
    vacatingRequestId = usableVacating.id;
    await db
      .update(vacatingRequests)
      .set({
        checkoutSettlementSuppressed: false,
        status: 'completed',
        resolvedAt: new Date(),
        ...(input.resolvedByAdminId
          ? { resolvedByAdminId: input.resolvedByAdminId }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(vacatingRequests.id, usableVacating.id));
  } else {
    const fallbackDate =
      booking.expectedCheckoutDate ??
      (await resolveEmergencyVacatingDate(input.bookingId, todayString()));
    const noticeGivenDate = formatDate(parseDate(booking.createdAt));
    const monthlyRent = monthlyRentFromBookingSnapshot(
      booking.pricingSnapshot as PricingSnapshot | null,
    );

    const [createdVacating] = await db
      .insert(vacatingRequests)
      .values({
        bookingId: input.bookingId,
        customerId: input.customerId,
        noticeGivenDate,
        vacatingDate: fallbackDate,
        noticeCompliant: true,
        deductionPaise: 0,
        depositRefundPaise: 0,
        monthlyRentPaiseSnapshot: monthlyRent,
        status: 'completed',
        checkoutSettlementSuppressed: false,
        resolvedAt: new Date(),
        resolvedByAdminId: input.resolvedByAdminId ?? null,
        notes:
          input.notes ??
          'Emergency checkout — resident removed from bed without a vacating record.',
      })
      .returning({ id: vacatingRequests.id });

    vacatingRequestId = createdVacating.id;

    await db.insert(auditLog).values({
      actorType: input.resolvedByAdminId ? 'admin' : 'system',
      actorId: input.resolvedByAdminId ?? null,
      entity: 'vacating_request',
      entityId: createdVacating.id,
      action: 'emergency_checkout_backfill',
      diff: {
        bookingId: input.bookingId,
        vacatingDate: fallbackDate,
        checkoutSource,
      },
    });
  }

  const settlement = await createCheckoutSettlementFromVacating({
    vacatingRequestId: vacatingRequestId!,
    checkoutSource,
  });
  if (!settlement.ok) return { ok: false, error: settlement.error };

  return {
    ok: true,
    settlementId: settlement.settlementId,
    vacatingRequestId: vacatingRequestId!,
    created: true,
  };
}

export type RepairMissingCheckoutSettlementRow = {
  bookingId: string;
  bookingCode: string;
  customerName: string;
};

/** One-time / cron repair for completed bookings with deposit but no settlement. */
export async function repairMissingCheckoutSettlements(input?: {
  bookingCode?: string;
  dryRun?: boolean;
}): Promise<{
  scanned: number;
  repaired: number;
  failures: Array<{ bookingCode: string; error: string }>;
}> {
  const rows = await db.execute<{
    booking_id: string;
    booking_code: string;
    customer_id: string;
    customer_name: string;
  }>(sql`
    SELECT bk.id::text AS booking_id, bk.booking_code, bk.customer_id::text AS customer_id,
           c.full_name AS customer_name
    FROM bookings bk
    INNER JOIN customers c ON c.id = bk.customer_id
    WHERE bk.status = 'completed' AND bk.deposit_paise > 0
      AND NOT EXISTS (
        SELECT 1 FROM checkout_settlements cs
        WHERE cs.booking_id = bk.id AND cs.status <> 'archived'
      )
      ${input?.bookingCode ? sql`AND bk.booking_code = ${input.bookingCode}` : sql``}
    ORDER BY bk.updated_at DESC
    LIMIT 200
  `);

  const failures: Array<{ bookingCode: string; error: string }> = [];
  let repaired = 0;

  for (const row of rows) {
    if (input?.dryRun) {
      repaired += 1;
      continue;
    }
    const result = await ensureEmergencyCheckoutForBooking({
      bookingId: row.booking_id,
      customerId: row.customer_id,
      checkoutSource: 'emergency_checkout',
      notes: 'Repaired missing checkout settlement for completed stay.',
    });
    if (result.ok) {
      repaired += 1;
    } else {
      failures.push({ bookingCode: row.booking_code, error: result.error });
    }
  }

  return { scanned: rows.length, repaired, failures };
}

/** Idempotent — creates settlements for approved/completed vacating rows that pre-date f311358. */
export async function syncMissingCheckoutSettlements(): Promise<{
  scanned: number;
  created: number;
}> {
  const result = await backfillCheckoutSettlementsFromVacating();
  return { scanned: result.scanned, created: result.created.length };
}

export async function listCheckoutSettlements(
  session: AdminSession,
  tab: CheckoutSettlementListTab,
): Promise<CheckoutSettlementRow[]> {
  const statuses = TAB_STATUS[tab];
  const rows = await db.execute<SettlementJoinRow>(sql`
    SELECT
      cs.*,
      c.full_name AS customer_name,
      c.phone AS customer_phone,
      b.booking_code AS booking_code,
      b.stay_type AS stay_type,
      b.duration_mode AS duration_mode,
      loc.pg_name,
      loc.pg_id,
      loc.room_number,
      loc.room_id,
      loc.bed_code,
      vr.vacating_date AS vacating_date,
      vr.notice_given_date AS notice_given_date,
      NULL::text AS move_in_date
    FROM checkout_settlements cs
    INNER JOIN customers c ON c.id = cs.customer_id
    INNER JOIN bookings b ON b.id = cs.booking_id
    INNER JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
      AND vr.checkout_settlement_suppressed = false
    LEFT JOIN LATERAL (
      SELECT
        bd.bed_code,
        r.id::text AS room_id,
        r.room_number,
        p.id::text AS pg_id,
        p.name AS pg_name
      FROM bed_reservations br
      INNER JOIN beds bd ON bd.id = br.bed_id
      INNER JOIN rooms r ON r.id = bd.room_id
      INNER JOIN floors f ON f.id = r.floor_id
      INNER JOIN pgs p ON p.id = f.pg_id
      WHERE br.booking_id = cs.booking_id
        AND br.kind = 'primary'
      ORDER BY br.created_at DESC
      LIMIT 1
    ) loc ON true
    WHERE cs.status IN ${sql.raw(`(${statuses.map((s) => `'${s}'`).join(',')})`)}
    ORDER BY cs.updated_at DESC
    LIMIT 100
  `);

  return Array.from(rows)
    .filter(
      (r) =>
        !r.pg_id ||
        adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, r.pg_id),
    )
    .map(mapJoinRow);
}

/** All operational checkout settlements for the unified move-out pipeline view. */
export async function listPipelineCheckoutSettlements(
  session: AdminSession,
): Promise<CheckoutSettlementRow[]> {
  const rows = await db.execute<SettlementJoinRow>(sql`
    SELECT
      cs.*,
      c.full_name AS customer_name,
      c.phone AS customer_phone,
      b.booking_code AS booking_code,
      b.stay_type AS stay_type,
      b.duration_mode AS duration_mode,
      loc.pg_name,
      loc.pg_id,
      loc.room_number,
      loc.room_id,
      loc.bed_code,
      vr.vacating_date AS vacating_date,
      vr.notice_given_date AS notice_given_date,
      NULL::text AS move_in_date
    FROM checkout_settlements cs
    INNER JOIN customers c ON c.id = cs.customer_id
    INNER JOIN bookings b ON b.id = cs.booking_id
    INNER JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
      AND vr.checkout_settlement_suppressed = false
    LEFT JOIN LATERAL (
      SELECT
        bd.bed_code,
        r.id::text AS room_id,
        r.room_number,
        p.id::text AS pg_id,
        p.name AS pg_name
      FROM bed_reservations br
      INNER JOIN beds bd ON bd.id = br.bed_id
      INNER JOIN rooms r ON r.id = bd.room_id
      INNER JOIN floors f ON f.id = r.floor_id
      INNER JOIN pgs p ON p.id = f.pg_id
      WHERE br.booking_id = cs.booking_id
        AND br.kind = 'primary'
      ORDER BY br.created_at DESC
      LIMIT 1
    ) loc ON true
    WHERE cs.status IN ${sql.raw(`(${OPERATIONAL_SETTLEMENT_STATUSES.map((s) => `'${s}'`).join(',')})`)}
    ORDER BY cs.updated_at DESC
    LIMIT 500
  `);

  return Array.from(rows)
    .filter(
      (r) =>
        !r.pg_id ||
        adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, r.pg_id),
    )
    .map(mapJoinRow);
}

export async function getCheckoutSettlementStoredImageUrl(
  session: AdminSession,
  settlementId: string,
): Promise<CheckoutSettlement | null> {
  const row = await loadSettlementRow(settlementId);
  if (!row) return null;

  if (
    row.pg_id &&
    !adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pg_id)
  ) {
    return null;
  }

  return mapDbSettlement(row);
}

export async function getCheckoutSettlementDetail(
  session: AdminSession,
  settlementId: string,
): Promise<CheckoutSettlementDetail | null> {
  const row = await loadSettlementRow(settlementId);
  if (!row) return null;

  if (
    row.pg_id &&
    !adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pg_id)
  ) {
    return null;
  }

  return buildCheckoutSettlementDetailFromJoinRow(row);
}

async function buildCheckoutSettlementDetailFromJoinRow(
  row: NonNullable<Awaited<ReturnType<typeof loadSettlementRow>>>,
): Promise<CheckoutSettlementDetail> {
  const wallet = await getDepositSummaryForBooking(row.bookingId);
  const depositHeld = paiseField(wallet?.refundableBalancePaise ?? 0);
  const moneyBalances = await getBookingMoneyBalances(row.bookingId);
  const outstandingRentAtCheckoutPaise = moneyBalances?.rent.outstandingPaise ?? 0;
  const { getResidentCreditBalance } = await import('@/src/services/residentCreditLedger');
  const creditBalancePaise = paiseField(await getResidentCreditBalance(row.customerId));
  let settlement = mapDbSettlement(row);
  settlement = await reconcileCheckoutSettlementNoticePolicy(
    settlement,
    row.notice_given_date,
    row.vacating_date,
    { stayType: row.stay_type, durationMode: row.duration_mode },
  );
  const roomOccupancy = await resolveRoomOccupancyContext(row.booking_id);
  const sharingUsed = effectiveSharingCount({
    autoDetectedCount: roomOccupancy.autoDetectedCount,
    roomCapacity: roomOccupancy.roomCapacity,
    overrideEnabled: settlement.electricitySharingOverride,
    overrideCount: settlement.electricityOccupants,
  });

  let electricityTotalBillPaise = settlement.averageBillPaise ?? 0;
  let unitsForAllocation: number | null = null;
  if (settlement.electricityCalculationMethod === 'meter_reading') {
    const prev = settlement.electricityPreviousReading
      ? Number(settlement.electricityPreviousReading)
      : null;
    const cur = settlement.electricityCurrentReading
      ? Number(settlement.electricityCurrentReading)
      : null;
    const rate = settlement.electricityUnitRatePaise ?? defaultElectricityRatePaise();
    if (prev != null && cur != null && !Number.isNaN(prev) && !Number.isNaN(cur)) {
      const bill = calculateCheckoutElectricity({
        previousReading: prev,
        currentReading: cur,
        ratePerUnitPaise: rate,
        roomOccupants: sharingUsed,
      });
      if (bill.ok) {
        electricityTotalBillPaise = bill.calc.totalBillPaise;
        unitsForAllocation = bill.calc.unitsConsumed;
      }
    }
  } else if (settlement.electricityCalculationMethod === 'manual_amount') {
    electricityTotalBillPaise = settlement.manualChargePaise ?? settlement.electricitySharePaise;
  }

  let roomElectricityAllocation: RoomElectricityCheckoutAllocation | null = null;
  if (row.room_id && electricityTotalBillPaise > 0) {
    try {
      roomElectricityAllocation = await buildRoomElectricityCheckoutAllocation({
        roomId: row.room_id,
        customerId: settlement.customerId,
        vacatingDate: row.vacating_date,
        totalBillPaise: electricityTotalBillPaise,
        unitsConsumed: unitsForAllocation,
        excludeCheckoutSettlementId: settlement.id,
      });
    } catch {
      roomElectricityAllocation = null;
    }
  }

  const resolvedSharePaise = resolveCheckoutElectricitySharePaise(settlement);
  const previewSettlement =
    resolvedSharePaise !== settlement.electricitySharePaise
      ? { ...settlement, electricitySharePaise: resolvedSharePaise }
      : settlement;

  let roomElectricityLedger: RoomElectricityLedgerCycleView | null = null;
  if (row.room_id && resolvedSharePaise > 0) {
    try {
      roomElectricityLedger = await getRoomElectricityLedgerCycle(row.room_id, row.vacating_date, {
        fallbackTotalBillPaise: electricityTotalBillPaise,
      });
      if (roomElectricityLedger) {
        roomElectricityLedger = {
          ...roomElectricityLedger,
          collectedPaise: roomElectricityLedger.collectedPaise + resolvedSharePaise,
          remainingPaise: Math.max(
            0,
            roomElectricityLedger.totalBillPaise -
              roomElectricityLedger.collectedPaise -
              resolvedSharePaise,
          ),
        };
      } else if (electricityTotalBillPaise > 0) {
        roomElectricityLedger = {
          billingMonth: firstOfMonth(row.vacating_date),
          totalBillPaise: electricityTotalBillPaise,
          collectedPaise: resolvedSharePaise,
          remainingPaise: Math.max(0, electricityTotalBillPaise - resolvedSharePaise),
          entries: [],
        };
      }
    } catch {
      roomElectricityLedger = null;
    }
  }

  return enrichCheckoutSettlementImageEvidence({
    ...mapJoinRow(row),
    stayType: row.stay_type ?? null,
    durationMode: row.duration_mode ?? null,
    depositCollectedPaise: paiseField(wallet?.collectedPaise ?? 0),
    depositDeductedPaise: paiseField(wallet?.deductedPaise ?? 0),
    depositRefundedPaise: paiseField(wallet?.refundedPaise ?? 0),
    depositRefundablePaise: depositHeld,
    creditBalancePaise,
    moveInDate: row.move_in_date,
    noticeGivenDate: row.notice_given_date,
    roomMonthlyOccupants: roomOccupancy.autoDetectedCount,
    roomOccupancy,
    effectiveSharingCount: sharingUsed,
    electricityTotalBillPaise,
    roomElectricityAllocation,
    roomElectricityLedger,
    preview: buildPreview(previewSettlement, depositHeld, outstandingRentAtCheckoutPaise),
  });
}

/** Read-only checkout detail for booking history, deposit ledger, and receipts. */
export async function getCheckoutSettlementDetailForBooking(
  bookingId: string,
): Promise<CheckoutSettlementDetail | null> {
  const [idRow] = await db
    .select({ id: checkoutSettlements.id })
    .from(checkoutSettlements)
    .where(
      and(
        eq(checkoutSettlements.bookingId, bookingId),
        sql`${checkoutSettlements.status} <> 'archived'`,
      ),
    )
    .orderBy(desc(checkoutSettlements.updatedAt))
    .limit(1);
  if (!idRow) return null;
  const row = await loadSettlementRow(idRow.id);
  if (!row) return null;
  return buildCheckoutSettlementDetailFromJoinRow(row);
}

/** Latest non-archived settlement for refund eligibility (includes checkout source). */
export async function getRefundEligibilitySettlementForCustomer(
  customerId: string,
  bookingId: string,
): Promise<{
  status: string;
  rejectionReason?: string | null;
  checkoutSource?: string | null;
} | null> {
  const [row] = await db
    .select({
      status: checkoutSettlements.status,
      refundNotes: checkoutSettlements.refundNotes,
      checkoutSource: checkoutSettlements.checkoutSource,
    })
    .from(checkoutSettlements)
    .where(
      and(
        eq(checkoutSettlements.customerId, customerId),
        eq(checkoutSettlements.bookingId, bookingId),
        sql`${checkoutSettlements.status} <> 'archived'`,
      ),
    )
    .orderBy(desc(checkoutSettlements.updatedAt))
    .limit(1);
  if (!row) return null;
  return {
    status: row.status,
    rejectionReason: row.refundNotes,
    checkoutSource: row.checkoutSource,
  };
}

export async function getCheckoutSettlementForCustomer(
  customerId: string,
  bookingId: string,
): Promise<CheckoutSettlement | null> {
  const [row] = await db
    .select()
    .from(checkoutSettlements)
    .where(
      and(
        eq(checkoutSettlements.customerId, customerId),
        eq(checkoutSettlements.bookingId, bookingId),
        inArray(checkoutSettlements.status, [
          'awaiting_resident_details',
          'awaiting_admin_review',
        ]),
      ),
    )
    .orderBy(desc(checkoutSettlements.updatedAt))
    .limit(1);
  if (!row) return null;

  const [vacating] = await db
    .select({
      noticeGivenDate: vacatingRequests.noticeGivenDate,
      vacatingDate: vacatingRequests.vacatingDate,
    })
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, row.vacatingRequestId))
    .limit(1);

  if (!vacating) return row;

  return reconcileCheckoutSettlementNoticePolicy(
    row,
    vacating.noticeGivenDate,
    vacating.vacatingDate,
  );
}

/** Latest checkout settlement status for resident vacating timeline (any non-archived row). */
export async function getLatestCheckoutSettlementStatusForCustomer(
  customerId: string,
  bookingId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ status: checkoutSettlements.status })
    .from(checkoutSettlements)
    .where(
      and(
        eq(checkoutSettlements.customerId, customerId),
        eq(checkoutSettlements.bookingId, bookingId),
        sql`${checkoutSettlements.status} <> 'archived'`,
      ),
    )
    .orderBy(desc(checkoutSettlements.updatedAt))
    .limit(1);
  return row?.status ?? null;
}

export async function submitResidentCheckoutDetails(input: {
  settlementId: string;
  customerId: string;
  electricityMeterPhotoUrl?: string | null;
  electricityUseAverage?: boolean;
  electricityPreviousReading?: number | null;
  electricityCurrentReading?: number | null;
  electricityUnits?: number | null;
  electricityOccupants?: number | null;
  electricityUnitRatePaise?: number | null;
  electricitySharePaise?: number | null;
  payoutUpiId?: string | null;
  payoutQrUrl?: string | null;
  residentRemarks?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [current] = await db
    .select()
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.id, input.settlementId))
    .limit(1);
  if (!current || current.customerId !== input.customerId) {
    return { ok: false, error: 'Settlement not found.' };
  }
  if (current.status !== 'awaiting_resident_details') {
    return { ok: false, error: 'Settlement is no longer accepting resident details.' };
  }

  const draft = {
    ...current,
    electricityMeterPhotoUrl: input.electricityMeterPhotoUrl ?? current.electricityMeterPhotoUrl,
    electricityUseAverage: input.electricityUseAverage ?? current.electricityUseAverage,
    electricitySharePaise: input.electricitySharePaise ?? current.electricitySharePaise,
    payoutUpiId: input.payoutUpiId ?? current.payoutUpiId,
    payoutQrUrl: input.payoutQrUrl ?? current.payoutQrUrl,
  };
  const wallet = await getDepositSummaryForBooking(current.bookingId);
  const preview = buildPreview(draft, wallet?.refundableBalancePaise ?? 0);
  const validation = validateDepositRefundSubmission(
    {
      meterReadingPhotoUrl: draft.electricityMeterPhotoUrl,
      useAverageBillingFallback: draft.electricityUseAverage,
      payoutUpiId: draft.payoutUpiId,
      payoutQrUrl: draft.payoutQrUrl,
    },
    { expectedRefundPaise: preview.finalRefundPaise },
  );
  if (!validation.ok) {
    return { ok: false, error: DEPOSIT_REFUND_MISSING_DETAILS_MESSAGE };
  }

  await db
    .update(checkoutSettlements)
    .set({
      electricityMeterPhotoUrl: input.electricityMeterPhotoUrl ?? null,
      electricityUseAverage: input.electricityUseAverage ?? false,
      electricityPreviousReading:
        input.electricityPreviousReading != null
          ? String(input.electricityPreviousReading)
          : null,
      electricityCurrentReading:
        input.electricityCurrentReading != null
          ? String(input.electricityCurrentReading)
          : null,
      electricityUnits: input.electricityUnits != null ? String(input.electricityUnits) : null,
      electricityOccupants: input.electricityOccupants ?? null,
      electricityUnitRatePaise: input.electricityUnitRatePaise ?? null,
      electricitySharePaise: input.electricitySharePaise ?? 0,
      payoutUpiId: input.payoutUpiId?.trim() || null,
      payoutQrUrl: input.payoutQrUrl ?? null,
      status: 'awaiting_admin_review',
      refundNotes: input.residentRemarks?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(checkoutSettlements.id, input.settlementId));

  const { linkResidentUpload } = await import('@/src/services/residentUploadEvents');
  const [pgRow] = await db
    .select({ pgId: pgs.id })
    .from(bookings)
    .innerJoin(
      bedReservations,
      and(eq(bedReservations.bookingId, bookings.id), eq(bedReservations.kind, 'primary')),
    )
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(eq(bookings.id, current.bookingId))
    .limit(1);
  const pgId = pgRow?.pgId ?? null;
  if (input.electricityMeterPhotoUrl?.trim()) {
    await linkResidentUpload({
      storagePath: input.electricityMeterPhotoUrl.trim(),
      adminQueue: 'checkout_settlements',
      linkedEntity: 'checkout_settlement',
      linkedEntityId: input.settlementId,
      bookingId: current.bookingId,
      pgId,
    }).catch(() => undefined);
  }
  if (input.payoutQrUrl?.trim()) {
    await linkResidentUpload({
      storagePath: input.payoutQrUrl.trim(),
      adminQueue: 'checkout_settlements',
      linkedEntity: 'checkout_settlement',
      linkedEntityId: input.settlementId,
      bookingId: current.bookingId,
      pgId,
    }).catch(() => undefined);
  }

  scheduleAdminNotificationSync();
  const { resolveFixedStayCheckoutForBooking } = await import(
    '@/src/services/fixedStayActionItems'
  );
  await resolveFixedStayCheckoutForBooking(current.bookingId);
  const { refreshAdminNotificationsFromActionItems } = await import(
    '@/src/services/actionItems'
  );
  await refreshAdminNotificationsFromActionItems().catch(() => undefined);
  return { ok: true };
}

/** Admin rejects incomplete refund submission; resident may resubmit without manual reset. */
export async function rejectResidentCheckoutSubmission(input: {
  settlementId: string;
  adminId: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: 'Rejection reason is required.' };

  const [current] = await db
    .select({
      id: checkoutSettlements.id,
      status: checkoutSettlements.status,
      customerId: checkoutSettlements.customerId,
      bookingId: checkoutSettlements.bookingId,
    })
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.id, input.settlementId))
    .limit(1);
  if (!current) return { ok: false, error: 'Checkout settlement not found.' };
  if (current.status !== 'awaiting_admin_review') {
    return { ok: false, error: 'Only submitted refund requests can be rejected.' };
  }

  await db
    .update(checkoutSettlements)
    .set({
      status: 'awaiting_resident_details',
      refundNotes: reason,
      amountsLocked: false,
      updatedAt: new Date(),
    })
    .where(eq(checkoutSettlements.id, input.settlementId));

  await db.insert(auditLog).values({
    actorId: input.adminId,
    actorType: 'admin',
    entity: 'checkout_settlement',
    entityId: input.settlementId,
    action: 'reject_resident_submission',
    diff: { reason },
  });

  scheduleAdminNotificationSync();
  const { refreshAdminNotificationsFromActionItems } = await import(
    '@/src/services/actionItems'
  );
  await refreshAdminNotificationsFromActionItems().catch(() => undefined);
  return { ok: true };
}

/** Creates or returns an open checkout settlement when resident requests a refund. */
export async function ensureCheckoutSettlementForBooking(input: {
  bookingId: string;
  customerId: string;
}): Promise<{ ok: true; settlementId: string } | { ok: false; error: string }> {
  const existing = await getCheckoutSettlementForCustomer(input.customerId, input.bookingId);
  if (existing) return { ok: true, settlementId: existing.id };

  const [existingAny] = await db
    .select({ id: checkoutSettlements.id })
    .from(checkoutSettlements)
    .where(
      and(
        eq(checkoutSettlements.customerId, input.customerId),
        eq(checkoutSettlements.bookingId, input.bookingId),
        sql`${checkoutSettlements.status} <> 'archived'`,
      ),
    )
    .orderBy(desc(checkoutSettlements.updatedAt))
    .limit(1);
  if (existingAny) return { ok: true, settlementId: existingAny.id };

  const [booking] = await db
    .select({
      id: bookings.id,
      customerId: bookings.customerId,
      status: bookings.status,
      durationMode: bookings.durationMode,
      expectedCheckoutDate: bookings.expectedCheckoutDate,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .where(
      and(eq(bookings.id, input.bookingId), eq(bookings.customerId, input.customerId)),
    )
    .limit(1);
  if (!booking) return { ok: false, error: 'Booking not found.' };
  if (booking.status !== 'confirmed' && booking.status !== 'completed') {
    return { ok: false, error: 'Booking is not active for checkout.' };
  }

  let vacatingRequestId: string;

  if (isFixedStayDurationMode(booking.durationMode)) {
    const { ensureFixedStayCheckoutPrerequisites } = await import(
      '@/src/services/fixedStayAutoExpiry'
    );
    vacatingRequestId = await ensureFixedStayCheckoutPrerequisites({ id: booking.id });
  } else {
    const [vacatingRow] = await db
      .select({ id: vacatingRequests.id, status: vacatingRequests.status })
      .from(vacatingRequests)
      .where(eq(vacatingRequests.bookingId, booking.id))
      .orderBy(desc(vacatingRequests.updatedAt))
      .limit(1);

    if (
      vacatingRow &&
      (vacatingRow.status === 'approved' || vacatingRow.status === 'completed')
    ) {
      vacatingRequestId = vacatingRow.id;
    } else if (booking.status === 'completed') {
      const emergency = await ensureEmergencyCheckoutForBooking({
        bookingId: booking.id,
        customerId: booking.customerId,
        checkoutSource: 'emergency_checkout',
      });
      if (!emergency.ok) return { ok: false, error: emergency.error };
      return { ok: true, settlementId: emergency.settlementId };
    } else {
      const [approvedVacating] = await db
        .select({ id: vacatingRequests.id })
        .from(vacatingRequests)
        .where(
          and(
            eq(vacatingRequests.bookingId, booking.id),
            eq(vacatingRequests.status, 'approved'),
          ),
        )
        .orderBy(desc(vacatingRequests.updatedAt))
        .limit(1);
      if (!approvedVacating) {
        return {
          ok: false,
          error: 'Move-out must be approved before you can request a refund.',
        };
      }
      vacatingRequestId = approvedVacating.id;
    }
  }

  const created = await createCheckoutSettlementFromVacating({ vacatingRequestId });
  if (!created.ok) return { ok: false, error: created.error };
  return { ok: true, settlementId: created.settlementId };
}

export async function updateCheckoutElectricitySettlement(input: {
  settlementId: string;
  adminId: string;
  calculationMethod: ElectricityCalculationMethod;
  previousReading?: number;
  currentReading?: number;
  ratePerUnitInr?: number;
  averageBillInr?: number;
  manualChargeInr?: number;
  deductFromDeposit: boolean;
  meterPhotoMissing: boolean;
  sharingOverride: boolean;
  sharingCountOverride?: number | null;
}): Promise<
  | { ok: true; calc: import('@/src/lib/checkout/electricitySettlementCalc').CheckoutElectricityCalc }
  | { ok: false; error: string }
> {
  const [current] = await db
    .select()
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.id, input.settlementId))
    .limit(1);
  if (!current) return { ok: false, error: 'Settlement not found.' };
  if (current.amountsLocked) {
    return { ok: false, error: 'Settlement amounts are locked.' };
  }
  if (!['awaiting_admin_review', 'awaiting_resident_details'].includes(current.status)) {
    return { ok: false, error: 'Settlement cannot be edited in this status.' };
  }

  const roomOccupancy = await resolveRoomOccupancyContext(current.bookingId);
  const effectiveOccupants = effectiveSharingCount({
    autoDetectedCount: roomOccupancy.autoDetectedCount,
    roomCapacity: roomOccupancy.roomCapacity,
    overrideEnabled: input.sharingOverride,
    overrideCount: input.sharingCountOverride,
  });

  let computed:
    | { ok: true; calc: import('@/src/lib/checkout/electricitySettlementCalc').CheckoutElectricityCalc }
    | { ok: false; error: string };

  if (input.calculationMethod === 'meter_reading') {
    if (
      input.previousReading == null ||
      input.currentReading == null ||
      input.ratePerUnitInr == null
    ) {
      return { ok: false, error: 'Enter previous reading, current reading, and rate per unit.' };
    }
    computed = calculateCheckoutElectricity({
      previousReading: input.previousReading,
      currentReading: input.currentReading,
      ratePerUnitPaise: Math.round(input.ratePerUnitInr * 100),
      roomOccupants: effectiveOccupants,
    });
  } else if (input.calculationMethod === 'average_billing') {
    if (input.averageBillInr == null) {
      return { ok: false, error: 'Enter average room electricity bill.' };
    }
    computed = calculateAverageBillingElectricity({
      averageBillPaise: Math.round(input.averageBillInr * 100),
      roomOccupants: effectiveOccupants,
      autoDetectedOccupants: roomOccupancy.autoDetectedCount,
    });
  } else {
    if (input.manualChargeInr == null) {
      return { ok: false, error: 'Enter electricity charge for this resident.' };
    }
    computed = calculateManualElectricityCharge({
      manualChargePaise: Math.round(input.manualChargeInr * 100),
      roomOccupants: effectiveOccupants,
      autoDetectedOccupants: roomOccupancy.autoDetectedCount,
    });
  }
  if (!computed.ok) return computed;

  let timelineSharePaise: number | null = null;
  let roomElectricityAllocation: RoomElectricityCheckoutAllocation | null = null;
  const skipTimelineAllocation = input.calculationMethod === 'manual_amount';
  const checkoutRoomId = await bookingRoomId(current.bookingId);
  if (!skipTimelineAllocation && checkoutRoomId && computed.calc.totalBillPaise > 0) {
    const [vacatingRow] = await db
      .select({ vacatingDate: vacatingRequests.vacatingDate })
      .from(checkoutSettlements)
      .innerJoin(vacatingRequests, eq(vacatingRequests.id, checkoutSettlements.vacatingRequestId))
      .where(eq(checkoutSettlements.id, input.settlementId))
      .limit(1);
    if (vacatingRow?.vacatingDate) {
      roomElectricityAllocation = await buildRoomElectricityCheckoutAllocation({
        roomId: checkoutRoomId,
        customerId: current.customerId,
        vacatingDate: String(vacatingRow.vacatingDate),
        totalBillPaise: computed.calc.totalBillPaise,
        unitsConsumed: computed.calc.unitsConsumed,
        excludeCheckoutSettlementId: input.settlementId,
      });
      timelineSharePaise = roomElectricityAllocation.currentResidentSharePaise;
    }
  }

  const finalSharePaise = timelineSharePaise ?? computed.calc.sharePaise;
  const finalCalc = { ...computed.calc, sharePaise: finalSharePaise };

  await db
    .update(checkoutSettlements)
    .set({
      electricityCalculationMethod: input.calculationMethod,
      electricityPreviousReading:
        input.calculationMethod === 'meter_reading' && input.previousReading != null
          ? String(input.previousReading)
          : null,
      electricityCurrentReading:
        input.calculationMethod === 'meter_reading' && input.currentReading != null
          ? String(input.currentReading)
          : null,
      electricityUnits:
        computed.calc.unitsConsumed != null ? String(computed.calc.unitsConsumed) : null,
      electricityOccupants: effectiveOccupants,
      autoDetectedSharingCount: roomOccupancy.autoDetectedCount,
      electricitySharingOverride: input.sharingOverride,
      electricityUnitRatePaise: computed.calc.ratePerUnitPaise,
      averageBillPaise:
        input.calculationMethod === 'average_billing' && input.averageBillInr != null
          ? Math.round(input.averageBillInr * 100)
          : null,
      manualChargePaise:
        input.calculationMethod === 'manual_amount' && input.manualChargeInr != null
          ? Math.round(input.manualChargeInr * 100)
          : null,
      electricitySharePaise: finalSharePaise,
      electricityDeductFromDeposit: input.deductFromDeposit,
      meterPhotoMissing: input.meterPhotoMissing,
      electricityUseAverage: input.calculationMethod === 'average_billing',
      updatedAt: new Date(),
    })
    .where(eq(checkoutSettlements.id, input.settlementId));

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'checkout_settlement',
    entityId: input.settlementId,
    action: 'electricity_settlement_updated',
    diff: {
      calculationMethod: input.calculationMethod,
      autoDetectedSharingCount: roomOccupancy.autoDetectedCount,
      effectiveSharingCount: effectiveOccupants,
      sharingOverride: input.sharingOverride,
      ratePerUnitPaise: computed.calc.ratePerUnitPaise,
      unitsConsumed: computed.calc.unitsConsumed,
      totalBillPaise: finalCalc.totalBillPaise,
      sharePaise: finalSharePaise,
      timelineAllocation: roomElectricityAllocation,
      deductFromDeposit: input.deductFromDeposit,
      meterPhotoMissing: input.meterPhotoMissing,
      occupantNames: roomOccupancy.occupantNames,
    },
  });

  return { ok: true, calc: finalCalc };
}

export async function updateCheckoutSettlementAdminFields(input: {
  settlementId: string;
  noticeDeductionPaise?: number;
  damageChargePaise?: number;
  cleaningChargePaise?: number;
  customChargePaise?: number;
  customChargeLabel?: string | null;
  electricitySharePaise?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [current] = await db
    .select()
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.id, input.settlementId))
    .limit(1);
  if (!current) return { ok: false, error: 'Settlement not found.' };
  if (current.amountsLocked) {
    return { ok: false, error: 'Settlement amounts are locked.' };
  }
  if (!['awaiting_admin_review', 'awaiting_resident_details'].includes(current.status)) {
    return { ok: false, error: 'Settlement cannot be edited in this status.' };
  }

  const patch: Partial<typeof checkoutSettlements.$inferInsert> = { updatedAt: new Date() };
  if (input.noticeDeductionPaise !== undefined) {
    patch.noticeDeductionPaise = input.noticeDeductionPaise;
  }
  if (input.damageChargePaise !== undefined) patch.damageChargePaise = input.damageChargePaise;
  if (input.cleaningChargePaise !== undefined) {
    patch.cleaningChargePaise = input.cleaningChargePaise;
  }
  if (input.customChargePaise !== undefined) patch.customChargePaise = input.customChargePaise;
  if (input.customChargeLabel !== undefined) patch.customChargeLabel = input.customChargeLabel;
  if (input.electricitySharePaise !== undefined) {
    patch.electricitySharePaise = input.electricitySharePaise;
  }

  await db
    .update(checkoutSettlements)
    .set(patch)
    .where(eq(checkoutSettlements.id, input.settlementId));

  return { ok: true };
}

export async function approveCheckoutSettlement(input: {
  settlementId: string;
  adminId: string;
}): Promise<{ ok: true; finalRefundPaise: number } | { ok: false; error: string }> {
  const [currentRow] = await db
    .select()
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.id, input.settlementId))
    .limit(1);
  if (!currentRow) return { ok: false, error: 'Settlement not found.' };

  const resolvedSharePaise = resolveCheckoutElectricitySharePaise(currentRow);
  let current = currentRow;
  if (resolvedSharePaise !== currentRow.electricitySharePaise) {
    await db
      .update(checkoutSettlements)
      .set({ electricitySharePaise: resolvedSharePaise, updatedAt: new Date() })
      .where(eq(checkoutSettlements.id, input.settlementId));
    current = { ...currentRow, electricitySharePaise: resolvedSharePaise };
  }

  const [booking] = await db
    .select({ stayType: bookings.stayType, durationMode: bookings.durationMode })
    .from(bookings)
    .where(eq(bookings.id, current.bookingId))
    .limit(1);

  if (
    booking &&
    !noticeDeductionAppliesToBooking(booking) &&
    current.noticeDeductionPaise > 0
  ) {
    return {
      ok: false,
      error: 'Fixed-stay checkout cannot include a notice fee. Save electricity and retry.',
    };
  }

  const wallet = await getDepositSummaryForBooking(current.bookingId);
  const depositHeld = wallet?.refundableBalancePaise ?? 0;
  const preview = buildPreview(current, depositHeld);
  const zeroRefund = preview.finalRefundPaise <= 0;

  const allowedStatuses: CheckoutSettlementStatus[] = zeroRefund
    ? ['awaiting_admin_review', 'awaiting_resident_details']
    : ['awaiting_admin_review'];
  if (!allowedStatuses.includes(current.status)) {
    return {
      ok: false,
      error: zeroRefund
        ? 'Settlement must be awaiting review or resident details.'
        : 'Settlement must be awaiting admin review.',
    };
  }
  if (!hasResidentRefundDetails(current, preview.finalRefundPaise)) {
    return { ok: false, error: DEPOSIT_REFUND_MISSING_DETAILS_MESSAGE };
  }
  if (!hasCheckoutElectricityEvidence(current)) {
    return {
      ok: false,
      error: 'Final AC meter photo (or average billing) is required before completing checkout.',
    };
  }

  const deductions = buildCheckoutSettlementDeductionPlan({
    noticeDeductionPaise: current.noticeDeductionPaise,
    noticeShortfallDays: current.noticeShortfallDays,
    noticeChargeableDays: current.noticeChargeableDays,
    noticeRentCoveredDays: current.noticeRentCoveredDays,
    electricitySharePaise: resolveCheckoutElectricitySharePaise(current),
    electricityDeductFromDeposit: current.electricityDeductFromDeposit !== false,
    damageChargePaise: current.damageChargePaise,
    cleaningChargePaise: current.cleaningChargePaise,
    customChargePaise: current.customChargePaise,
    customChargeLabel: current.customChargeLabel,
  });

  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM bookings WHERE id = ${current.bookingId} FOR UPDATE`,
      );
      await applyDepositDeductionsInTx(tx, {
        bookingId: current.bookingId,
        customerId: current.customerId,
        adminId: input.adminId,
        relatedVacatingId: current.vacatingRequestId,
        deductions,
      });
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not apply deductions.',
    };
  }

  const occupancy = await finalizeVacatingOccupancy({
    requestId: current.vacatingRequestId,
    resolvedByAdminId: input.adminId,
    depositRefundPaise: 0,
  });
  if (!occupancy.ok) {
    return {
      ok: false,
      error:
        occupancy.kind === 'bed_not_occupied'
          ? occupancy.message
          : `Could not complete vacating (${occupancy.kind}).`,
    };
  }

  const balanceAfter = (await getDepositSummaryForBooking(current.bookingId))
    ?.refundableBalancePaise ?? 0;
  const finalRefundPaise = Math.min(preview.finalRefundPaise, balanceAfter);

  await db
    .update(checkoutSettlements)
    .set({
      status: finalRefundPaise <= 0 ? 'completed' : 'refund_pending',
      amountsLocked: true,
      finalRefundPaise,
      deductionsSnapshot: preview,
      approvedAt: new Date(),
      approvedByAdminId: input.adminId,
      ...(finalRefundPaise <= 0
        ? {
            refundNotes: 'Deposit fully applied to deductions — no payout due.',
            refundPaidAt: new Date(),
            refundPaidByAdminId: input.adminId,
            refundReference: 'zero-balance-settlement',
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(checkoutSettlements.id, input.settlementId));

  if (finalRefundPaise <= 0) {
    await db
      .update(bookings)
      .set({ adminDepositRefundStatus: 'refunded', updatedAt: new Date() })
      .where(eq(bookings.id, current.bookingId));
    const { syncResidentRequestActionItems } = await import(
      '@/src/services/residentRequestActions'
    );
    await syncResidentRequestActionItems();
    const { refreshAdminNotificationsFromActionItems } = await import(
      '@/src/services/actionItems'
    );
    await refreshAdminNotificationsFromActionItems().catch(() => undefined);
  }

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'checkout_settlement',
    entityId: current.id,
    action: 'approved',
    diff: { finalRefundPaise, deductions },
  });

  scheduleAdminNotificationSync();
  await recordCheckoutElectricityCollectionFromSettlementId(current.id, {
    totalBillPaise: current.electricityCalculationMethod === 'manual_amount'
      ? resolvedSharePaise
      : undefined,
  });

  if (finalRefundPaise <= 0) {
    const { closeUncollectedDepositDue } = await import('./depositCollection');
    await closeUncollectedDepositDue({
      bookingId: current.bookingId,
      adminId: input.adminId,
      reason: 'Zero-refund checkout complete — deposit balance closed',
    });
  }

  return { ok: true, finalRefundPaise };
}

export async function markCheckoutRefundPaid(input: {
  settlementId: string;
  adminId: string;
  refundReference: string;
  refundMethod?: string;
  refundNotes?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [current] = await db
    .select()
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.id, input.settlementId))
    .limit(1);
  if (!current) return { ok: false, error: 'Settlement not found.' };
  if (current.status !== 'refund_pending') {
    return { ok: false, error: 'Settlement is not awaiting refund payout.' };
  }
  if (current.finalRefundPaise == null) {
    return { ok: false, error: 'Final refund amount not set.' };
  }

  const refundPaise = current.finalRefundPaise;
  const idempotencyKey = `checkout:${current.id}`;

  const wallet = await getDepositSummaryForBooking(current.bookingId);
  const ledgerBalance = wallet?.refundableBalancePaise ?? 0;
  if (refundPaise > ledgerBalance) {
    return {
      ok: false,
      error:
        'Deposit deductions were not applied to the ledger — approve checkout settlement before marking refund paid.',
    };
  }

  if (refundPaise > 0) {
    const settled = await settleDepositRefund({
      bookingId: current.bookingId,
      customerId: current.customerId,
      idempotencyKey,
      source: 'checkout',
      sourceId: current.id,
      adminId: input.adminId,
      reason: 'Checkout settlement refund',
      refundPaise,
      deductionsSnapshot: current.deductionsSnapshot ?? undefined,
      relatedVacatingId: current.vacatingRequestId,
      refundAudit: {
        refundMethod: input.refundMethod ?? (current.payoutUpiId ? 'upi' : 'qr'),
        refundReference: input.refundReference,
        refundProofUrl: current.payoutQrUrl,
      },
      markBookingRefunded: true,
    });
    if (!settled.ok) return { ok: false, error: settled.error };

    await db
      .update(checkoutSettlements)
      .set({
        status: 'completed',
        refundMethod: input.refundMethod ?? (current.payoutUpiId ? 'upi' : 'qr'),
        refundReference: input.refundReference,
        refundNotes: input.refundNotes ?? null,
        refundPaidAt: new Date(),
        refundPaidByAdminId: input.adminId,
        depositSettlementId: settled.settlementId,
        updatedAt: new Date(),
      })
      .where(eq(checkoutSettlements.id, input.settlementId));
  } else {
    await db
      .update(checkoutSettlements)
      .set({
        status: 'completed',
        refundReference: input.refundReference,
        refundNotes: input.refundNotes ?? null,
        refundPaidAt: new Date(),
        refundPaidByAdminId: input.adminId,
        updatedAt: new Date(),
      })
      .where(eq(checkoutSettlements.id, input.settlementId));
  }

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'checkout_settlement',
    entityId: current.id,
    action: 'refund_paid',
    diff: { refundPaise, refundReference: input.refundReference },
  });

  scheduleAdminNotificationSync();

  const { closeUncollectedDepositDue } = await import('./depositCollection');
  await closeUncollectedDepositDue({
    bookingId: current.bookingId,
    adminId: input.adminId,
    reason: 'Checkout refund paid — deposit balance closed',
  });

  return { ok: true };
}

export async function getCheckoutSettlementIdForVacating(
  vacatingRequestId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: checkoutSettlements.id })
    .from(checkoutSettlements)
    .where(
      and(
        eq(checkoutSettlements.vacatingRequestId, vacatingRequestId),
        inArray(checkoutSettlements.status, OPERATIONAL_SETTLEMENT_STATUSES),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

export type BackfillCheckoutSettlementRow = {
  settlementId: string;
  vacatingRequestId: string;
  bookingId: string;
  customerId: string;
  customerName: string;
  vacatingDate: string;
  status: CheckoutSettlementStatus;
  noticeDeductionPaise: number;
  hadDeductionSnapshot: boolean;
};

/** One-time backfill for vacating requests approved before checkout settlements existed. */
export async function backfillCheckoutSettlementsFromVacating(input?: {
  dryRun?: boolean;
}): Promise<{ scanned: number; created: BackfillCheckoutSettlementRow[] }> {
  const dryRun = input?.dryRun ?? false;

  const missing = await db.execute<{
    vacating_request_id: string;
    booking_id: string;
    customer_id: string;
    customer_name: string;
    vacating_date: string;
    notice_given_date: string;
    monthly_rent_paise_snapshot: number;
    deduction_paise: number;
    deposit_refund_paise: number;
  }>(sql`
    SELECT
      vr.id AS vacating_request_id,
      vr.booking_id,
      vr.customer_id,
      c.full_name AS customer_name,
      vr.vacating_date::text AS vacating_date,
      vr.notice_given_date::text AS notice_given_date,
      vr.monthly_rent_paise_snapshot,
      vr.deduction_paise,
      vr.deposit_refund_paise
    FROM vacating_requests vr
    INNER JOIN customers c ON c.id = vr.customer_id
    LEFT JOIN checkout_settlements cs ON cs.vacating_request_id = vr.id
    WHERE COALESCE(vr.checkout_settlement_suppressed, false) = false
      AND cs.id IS NULL
      AND (
        vr.status = 'completed'
        OR EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.id = vr.booking_id
            AND b.duration_mode IN ('fixed_stay', 'daily', 'weekly')
            AND vr.status IN ('approved', 'completed')
        )
        OR EXISTS (
          SELECT 1 FROM resident_requests rr
          WHERE rr.booking_id = vr.booking_id
            AND rr.type = 'deposit_refund'
            AND rr.status IN ('submitted', 'under_review', 'approved')
        )
      )
    ORDER BY vr.created_at ASC
  `);

  const created: BackfillCheckoutSettlementRow[] = [];

  for (const row of missing) {
    const [bookingMeta] = await db
      .select({ stayType: bookings.stayType, durationMode: bookings.durationMode })
      .from(bookings)
      .where(eq(bookings.id, row.booking_id))
      .limit(1);

    const policy = await resolvePolicyNoticeFields({
      bookingId: row.booking_id,
      monthlyRentPaiseSnapshot: row.monthly_rent_paise_snapshot,
      noticeGivenDate: row.notice_given_date,
      vacatingDate: row.vacating_date,
      stayType: bookingMeta?.stayType,
      durationMode: bookingMeta?.durationMode,
    });
    const noticeDeduction =
      noticeDeductionAppliesToBooking({
        stayType: bookingMeta?.stayType,
        durationMode: bookingMeta?.durationMode,
      }) && row.deduction_paise > 0
        ? row.deduction_paise
        : policy.noticeDeductionPaise;

    const [depositSettlement] = await db.execute<{ deductions_snapshot: RefundDeductionsSnapshot | null }>(
      sql`
        SELECT deductions_snapshot
        FROM deposit_settlements
        WHERE booking_id = ${row.booking_id}::uuid
        ORDER BY created_at DESC
        LIMIT 1
      `,
    );

    const [depositRefundRequest] = await db.execute<{
      refund_deductions: RefundDeductionsSnapshot | null;
      payout_upi_id: string | null;
      payout_qr_url: string | null;
      meter_reading_photo_url: string | null;
      use_average_billing_fallback: boolean;
    }>(sql`
      SELECT
        refund_deductions,
        payout_upi_id,
        payout_qr_url,
        meter_reading_photo_url,
        use_average_billing_fallback
      FROM resident_requests
      WHERE booking_id = ${row.booking_id}::uuid
        AND type = 'deposit_refund'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const snapshot =
      depositSettlement?.deductions_snapshot ??
      depositRefundRequest?.refund_deductions ??
      null;

    const [booking] = await db
      .select({ depositPaise: bookings.depositPaise })
      .from(bookings)
      .where(eq(bookings.id, row.booking_id))
      .limit(1);

    const insertValues = {
      vacatingRequestId: row.vacating_request_id,
      bookingId: row.booking_id,
      customerId: row.customer_id,
      status: 'awaiting_resident_details' as const,
      noticeRequiredDays: VACATING_NOTICE_MIN_DAYS,
      noticeGivenDays: policy.noticeGivenDays,
      noticeShortfallDays: policy.noticeShortfallDays,
      noticeDeductionPaise: noticeDeduction,
      noticeRentCoveredDays: policy.noticeRentCoveredDays,
      noticeChargeableDays: policy.noticeChargeableDays,
      noticeBreakdownJson: policy.noticeBreakdownJson,
      monthlyRentPaiseSnapshot: row.monthly_rent_paise_snapshot,
      depositRequiredPaise: booking?.depositPaise ?? 0,
      electricitySharePaise: 0,
      damageChargePaise: 0,
      cleaningChargePaise: 0,
      customChargePaise: 0,
      deductionsSnapshot: null,
      finalRefundPaise: row.deposit_refund_paise > 0 ? row.deposit_refund_paise : null,
      payoutUpiId: depositRefundRequest?.payout_upi_id ?? null,
      payoutQrUrl: depositRefundRequest?.payout_qr_url ?? null,
      electricityMeterPhotoUrl: depositRefundRequest?.meter_reading_photo_url ?? null,
      electricityUseAverage: depositRefundRequest?.use_average_billing_fallback ?? false,
    };

    if (dryRun) {
      created.push({
        settlementId: '(dry-run)',
        vacatingRequestId: row.vacating_request_id,
        bookingId: row.booking_id,
        customerId: row.customer_id,
        customerName: row.customer_name,
        vacatingDate: row.vacating_date,
        status: 'awaiting_resident_details',
        noticeDeductionPaise: insertValues.noticeDeductionPaise,
        hadDeductionSnapshot: snapshot != null,
      });
      continue;
    }

    const [inserted] = await db
      .insert(checkoutSettlements)
      .values(insertValues)
      .returning({ id: checkoutSettlements.id });

    await db.insert(auditLog).values({
      actorType: 'system',
      entity: 'checkout_settlement',
      entityId: inserted.id,
      action: 'backfilled',
      diff: {
        vacatingRequestId: row.vacating_request_id,
        bookingId: row.booking_id,
        source: 'backfill-checkout-settlements',
      },
    });

    created.push({
      settlementId: inserted.id,
      vacatingRequestId: row.vacating_request_id,
      bookingId: row.booking_id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      vacatingDate: row.vacating_date,
      status: 'awaiting_resident_details',
      noticeDeductionPaise: insertValues.noticeDeductionPaise,
      hadDeductionSnapshot: snapshot != null,
    });
  }

  if (!dryRun && created.length > 0) {
    scheduleAdminNotificationSync();
  }

  return { scanned: missing.length, created };
}

export async function deleteCheckoutSettlement(input: {
  settlementId: string;
  adminId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await db
    .select()
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.id, input.settlementId))
    .limit(1);
  if (!row) return { ok: false, error: 'Settlement not found.' };
  if (row.amountsLocked || row.status === 'refund_paid' || row.status === 'completed') {
    return {
      ok: false,
      error: 'Cannot delete a locked or completed settlement. Archive it instead.',
    };
  }

  await db.delete(checkoutSettlements).where(eq(checkoutSettlements.id, input.settlementId));
  await db
    .update(vacatingRequests)
    .set({ checkoutSettlementSuppressed: true, updatedAt: new Date() })
    .where(eq(vacatingRequests.id, row.vacatingRequestId));
  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'checkout_settlement',
    entityId: input.settlementId,
    action: 'deleted',
    diff: {
      vacatingRequestId: row.vacatingRequestId,
      bookingId: row.bookingId,
      status: row.status,
      checkoutSettlementSuppressed: true,
    },
  });
  scheduleAdminNotificationSync();
  return { ok: true };
}

/** Remove or archive all checkout settlements for a vacating request. */
export async function cleanupCheckoutSettlementForVacating(input: {
  vacatingRequestId: string;
  adminId?: string | null;
}): Promise<{ removed: boolean; settlementId: string | null; action: 'deleted' | 'archived' | 'none' }> {
  const settlements = await db
    .select()
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.vacatingRequestId, input.vacatingRequestId))
    .orderBy(sql`${checkoutSettlements.updatedAt} DESC`);
  if (settlements.length === 0) {
    return { removed: false, settlementId: null, action: 'none' };
  }

  let lastAction: 'deleted' | 'archived' = 'deleted';
  let lastId: string | null = null;

  for (const settlement of settlements) {
    if (
      settlement.amountsLocked ||
      settlement.status === 'refund_paid' ||
      settlement.status === 'completed'
    ) {
      await archiveCheckoutSettlement({
        settlementId: settlement.id,
        adminId: input.adminId ?? 'system',
      });
      lastAction = 'archived';
      lastId = settlement.id;
      continue;
    }

    const deleted = await deleteCheckoutSettlement({
      settlementId: settlement.id,
      adminId: input.adminId ?? 'system',
    });
    if (!deleted.ok) {
      throw new Error(deleted.error);
    }
    lastAction = 'deleted';
    lastId = settlement.id;
  }

  await db
    .update(vacatingRequests)
    .set({ checkoutSettlementSuppressed: true, updatedAt: new Date() })
    .where(eq(vacatingRequests.id, input.vacatingRequestId));

  return { removed: true, settlementId: lastId, action: lastAction };
}

export async function archiveCheckoutSettlement(input: {
  settlementId: string;
  adminId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await db
    .select()
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.id, input.settlementId))
    .limit(1);
  if (!row) return { ok: false, error: 'Settlement not found.' };
  if (row.status === 'archived') return { ok: true };

  await db
    .update(checkoutSettlements)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(checkoutSettlements.id, input.settlementId));

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'checkout_settlement',
    entityId: input.settlementId,
    action: 'archived',
    diff: { from: row.status, bookingId: row.bookingId },
  });
  scheduleAdminNotificationSync();
  return { ok: true };
}

export async function rebuildCheckoutSettlement(input: {
  settlementId: string;
  adminId: string;
}): Promise<{ ok: true; settlementId: string } | { ok: false; error: string }> {
  const [row] = await db
    .select()
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.id, input.settlementId))
    .limit(1);
  if (!row) return { ok: false, error: 'Settlement not found.' };
  if (row.amountsLocked || row.status === 'refund_paid' || row.status === 'completed') {
    return {
      ok: false,
      error: 'Cannot rebuild a locked or completed settlement.',
    };
  }

  const vacatingRequestId = row.vacatingRequestId;
  const bookingId = row.bookingId;

  await db
    .update(vacatingRequests)
    .set({ checkoutSettlementSuppressed: false, updatedAt: new Date() })
    .where(eq(vacatingRequests.id, vacatingRequestId));

  await db.delete(checkoutSettlements).where(eq(checkoutSettlements.id, input.settlementId));
  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'checkout_settlement',
    entityId: input.settlementId,
    action: 'rebuild_started',
    diff: { vacatingRequestId, bookingId, previousStatus: row.status },
  });

  const created = await createCheckoutSettlementFromVacating({ vacatingRequestId });
  if (!created.ok) {
    return { ok: false, error: created.error };
  }

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'checkout_settlement',
    entityId: created.settlementId,
    action: 'rebuilt',
    diff: { vacatingRequestId, bookingId, replacedSettlementId: input.settlementId },
  });

  scheduleAdminNotificationSync();
  return { ok: true, settlementId: created.settlementId };
}

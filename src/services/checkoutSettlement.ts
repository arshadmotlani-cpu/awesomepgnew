/**
 * Unified Checkout Settlement — single workflow for vacating money + occupancy.
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bookings,
  checkoutSettlements,
  type CheckoutSettlement,
  vacatingRequests,
} from '@/src/db/schema';
import type { CheckoutSettlementStatus } from '@/src/db/schema/enums';
import type { RefundDeductionsSnapshot } from '@/src/db/schema/residentRequests';
import type { AdminSession } from '@/src/lib/auth/session';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import { diffDays } from '@/src/lib/dates';
import {
  DEPOSIT_REFUND_MISSING_DETAILS_MESSAGE,
  validateDepositRefundSubmission,
} from '@/src/lib/billing/depositRefundRequirements';
import { computeRefundDeductions } from '@/src/lib/refundDeductions';
import {
  noticeShortfallDeduction,
  noticeShortfallDays,
  VACATING_NOTICE_MIN_DAYS,
} from '@/src/services/billing';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import {
  applyDepositDeductionsInTx,
  settleDepositRefund,
} from '@/src/services/depositSettlement';
import { finalizeVacatingOccupancy } from '@/src/services/vacating';
import { scheduleAdminNotificationSync } from '@/src/services/adminLiveSync';

export type CheckoutSettlementListTab =
  | 'awaiting_resident'
  | 'awaiting_review'
  | 'approved'
  | 'refund_pending'
  | 'completed';

const TAB_STATUS: Record<CheckoutSettlementListTab, CheckoutSettlementStatus[]> = {
  awaiting_resident: ['awaiting_resident_details'],
  awaiting_review: ['awaiting_admin_review'],
  approved: ['approved'],
  refund_pending: ['refund_pending'],
  completed: ['refund_paid', 'completed'],
};

export type CheckoutSettlementRow = CheckoutSettlement & {
  customerName: string;
  customerPhone: string;
  bookingCode: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  vacatingDate: string;
};

export type CheckoutSettlementDetail = CheckoutSettlementRow & {
  depositCollectedPaise: number;
  depositDeductedPaise: number;
  depositRefundedPaise: number;
  depositRefundablePaise: number;
  moveInDate: string | null;
  noticeGivenDate: string;
  preview: RefundDeductionsSnapshot & {
    finalRefundPaise: number;
    totalDeductionsPaise: number;
    noticeDeductionPaise: number;
    electricityDeductionPaise: number;
  };
};

function hasResidentRefundDetails(row: CheckoutSettlement): boolean {
  const hasElectricity =
    Boolean(row.electricityMeterPhotoUrl) || row.electricityUseAverage;
  const hasPayout = Boolean(row.payoutUpiId?.trim()) || Boolean(row.payoutQrUrl?.trim());
  return hasElectricity && hasPayout;
}

function buildPreview(row: CheckoutSettlement, depositHeldPaise: number) {
  const noticeDeductionPaise = row.amountsLocked
    ? row.noticeDeductionPaise
    : row.noticeDeductionPaise;
  const electricityDeductionPaise = row.electricitySharePaise;
  const calc = computeRefundDeductions(depositHeldPaise, {
    electricityUnitCostPaise: row.electricityUnitRatePaise ?? undefined,
    electricityUnits: row.electricityUnits ? Number(row.electricityUnits) : undefined,
    damageChargePaise: row.damageChargePaise,
    cleaningChargePaise: row.cleaningChargePaise,
    penaltyChargePaise: noticeDeductionPaise,
    customChargePaise: row.customChargePaise,
    customChargeLabel: row.customChargeLabel ?? undefined,
  });
  if (row.amountsLocked && row.finalRefundPaise != null) {
    return {
      ...calc,
      noticeDeductionPaise,
      electricityDeductionPaise,
      finalRefundPaise: row.finalRefundPaise,
      penaltyChargePaise: noticeDeductionPaise,
    };
  }
  const totalDeductionsPaise =
    noticeDeductionPaise +
    electricityDeductionPaise +
    row.damageChargePaise +
    row.cleaningChargePaise +
    row.customChargePaise;
  const finalRefundPaise = Math.max(0, depositHeldPaise - totalDeductionsPaise);
  return {
    ...calc,
    noticeDeductionPaise,
    electricityDeductionPaise,
    penaltyChargePaise: noticeDeductionPaise,
    totalDeductionsPaise,
    finalRefundPaise,
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
  created_at: Date;
  updated_at: Date;
  customer_name: string;
  customer_phone: string;
  booking_code: string;
  pg_name: string;
  pg_id: string;
  room_number: string;
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
    noticeRequiredDays: row.notice_required_days,
    noticeGivenDays: row.notice_given_days,
    noticeShortfallDays: row.notice_shortfall_days,
    noticeDeductionPaise: row.notice_deduction_paise,
    monthlyRentPaiseSnapshot: row.monthly_rent_paise_snapshot,
    depositRequiredPaise: row.deposit_required_paise,
    electricityMeterPhotoUrl: row.electricity_meter_photo_url,
    electricityUseAverage: row.electricity_use_average,
    electricityPreviousReading: row.electricity_previous_reading,
    electricityCurrentReading: row.electricity_current_reading,
    electricityUnits: row.electricity_units,
    electricityOccupants: row.electricity_occupants,
    electricityUnitRatePaise: row.electricity_unit_rate_paise,
    electricitySharePaise: row.electricity_share_paise,
    damageChargePaise: row.damage_charge_paise,
    cleaningChargePaise: row.cleaning_charge_paise,
    customChargePaise: row.custom_charge_paise,
    customChargeLabel: row.custom_charge_label,
    payoutUpiId: row.payout_upi_id,
    payoutQrUrl: row.payout_qr_url,
    deductionsSnapshot: row.deductions_snapshot,
    finalRefundPaise: row.final_refund_paise,
    amountsLocked: row.amounts_locked,
    refundMethod: row.refund_method,
    refundReference: row.refund_reference,
    refundNotes: row.refund_notes,
    refundPaidAt: row.refund_paid_at,
    approvedAt: row.approved_at,
    approvedByAdminId: row.approved_by_admin_id,
    refundPaidByAdminId: row.refund_paid_by_admin_id,
    depositSettlementId: row.deposit_settlement_id,
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
      loc.pg_name,
      loc.pg_id,
      loc.room_number,
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
    LEFT JOIN LATERAL (
      SELECT
        bd.bed_code,
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
}): Promise<{ ok: true; settlementId: string } | { ok: false; error: string }> {
  const [vr] = await db
    .select()
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, input.vacatingRequestId))
    .limit(1);
  if (!vr) return { ok: false, error: 'Vacating request not found.' };

  const [existing] = await db
    .select({ id: checkoutSettlements.id })
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.vacatingRequestId, vr.id))
    .limit(1);
  if (existing) return { ok: true, settlementId: existing.id };

  const noticeGiven = diffDays(vr.noticeGivenDate, vr.vacatingDate);
  const shortfall = noticeShortfallDays({
    noticeGivenDate: vr.noticeGivenDate,
    vacatingDate: vr.vacatingDate,
  });
  const noticeDeduction = noticeShortfallDeduction(vr.monthlyRentPaiseSnapshot, shortfall);

  const [booking] = await db
    .select({ depositPaise: bookings.depositPaise })
    .from(bookings)
    .where(eq(bookings.id, vr.bookingId))
    .limit(1);

  const [created] = await db
    .insert(checkoutSettlements)
    .values({
      vacatingRequestId: vr.id,
      bookingId: vr.bookingId,
      customerId: vr.customerId,
      status: 'awaiting_resident_details',
      noticeRequiredDays: VACATING_NOTICE_MIN_DAYS,
      noticeGivenDays: noticeGiven,
      noticeShortfallDays: shortfall,
      noticeDeductionPaise: noticeDeduction,
      monthlyRentPaiseSnapshot: vr.monthlyRentPaiseSnapshot,
      depositRequiredPaise: booking?.depositPaise ?? 0,
    })
    .returning({ id: checkoutSettlements.id });

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
  await syncMissingCheckoutSettlements();

  const statuses = TAB_STATUS[tab];
  const rows = await db.execute<SettlementJoinRow>(sql`
    SELECT
      cs.*,
      c.full_name AS customer_name,
      c.phone AS customer_phone,
      b.booking_code AS booking_code,
      loc.pg_name,
      loc.pg_id,
      loc.room_number,
      loc.bed_code,
      vr.vacating_date AS vacating_date,
      vr.notice_given_date AS notice_given_date,
      NULL::text AS move_in_date
    FROM checkout_settlements cs
    INNER JOIN customers c ON c.id = cs.customer_id
    INNER JOIN bookings b ON b.id = cs.booking_id
    INNER JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
    LEFT JOIN LATERAL (
      SELECT
        bd.bed_code,
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

  const wallet = await getDepositSummaryForBooking(row.bookingId);
  const depositHeld = wallet?.refundableBalancePaise ?? 0;
  const settlement = mapDbSettlement(row);

  return {
    ...mapJoinRow(row),
    depositCollectedPaise: wallet?.collectedPaise ?? 0,
    depositDeductedPaise: wallet?.deductedPaise ?? 0,
    depositRefundedPaise: wallet?.refundedPaise ?? 0,
    depositRefundablePaise: depositHeld,
    moveInDate: row.move_in_date,
    noticeGivenDate: row.notice_given_date,
    preview: buildPreview(settlement, depositHeld),
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
  return row ?? null;
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
    payoutUpiId: input.payoutUpiId ?? current.payoutUpiId,
    payoutQrUrl: input.payoutQrUrl ?? current.payoutQrUrl,
  };
  const validation = validateDepositRefundSubmission({
    meterReadingPhotoUrl: draft.electricityMeterPhotoUrl,
    useAverageBillingFallback: draft.electricityUseAverage,
    payoutUpiId: draft.payoutUpiId,
    payoutQrUrl: draft.payoutQrUrl,
  });
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
      updatedAt: new Date(),
    })
    .where(eq(checkoutSettlements.id, input.settlementId));

  scheduleAdminNotificationSync();
  return { ok: true };
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

  await db
    .update(checkoutSettlements)
    .set({
      noticeDeductionPaise: input.noticeDeductionPaise ?? current.noticeDeductionPaise,
      damageChargePaise: input.damageChargePaise ?? current.damageChargePaise,
      cleaningChargePaise: input.cleaningChargePaise ?? current.cleaningChargePaise,
      customChargePaise: input.customChargePaise ?? current.customChargePaise,
      customChargeLabel: input.customChargeLabel ?? current.customChargeLabel,
      electricitySharePaise: input.electricitySharePaise ?? current.electricitySharePaise,
      updatedAt: new Date(),
    })
    .where(eq(checkoutSettlements.id, input.settlementId));

  return { ok: true };
}

export async function approveCheckoutSettlement(input: {
  settlementId: string;
  adminId: string;
}): Promise<{ ok: true; finalRefundPaise: number } | { ok: false; error: string }> {
  const [current] = await db
    .select()
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.id, input.settlementId))
    .limit(1);
  if (!current) return { ok: false, error: 'Settlement not found.' };
  if (current.status !== 'awaiting_admin_review') {
    return { ok: false, error: 'Settlement must be awaiting admin review.' };
  }
  if (!hasResidentRefundDetails(current)) {
    return { ok: false, error: DEPOSIT_REFUND_MISSING_DETAILS_MESSAGE };
  }

  const wallet = await getDepositSummaryForBooking(current.bookingId);
  const depositHeld = wallet?.refundableBalancePaise ?? 0;
  const preview = buildPreview(current, depositHeld);

  const deductions: Array<{ amountPaise: number; reason: string }> = [];
  if (current.noticeDeductionPaise > 0) {
    deductions.push({
      amountPaise: current.noticeDeductionPaise,
      reason: `Notice shortfall (${current.noticeShortfallDays} days)`,
    });
  }
  if (current.electricitySharePaise > 0) {
    deductions.push({
      amountPaise: current.electricitySharePaise,
      reason: 'Electricity share at checkout',
    });
  }
  if (current.damageChargePaise > 0) {
    deductions.push({ amountPaise: current.damageChargePaise, reason: 'Damage charge' });
  }
  if (current.cleaningChargePaise > 0) {
    deductions.push({ amountPaise: current.cleaningChargePaise, reason: 'Cleaning charge' });
  }
  if (current.customChargePaise > 0) {
    deductions.push({
      amountPaise: current.customChargePaise,
      reason: current.customChargeLabel ?? 'Custom charge',
    });
  }

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
      status: 'refund_pending',
      amountsLocked: true,
      finalRefundPaise,
      deductionsSnapshot: preview,
      approvedAt: new Date(),
      approvedByAdminId: input.adminId,
      updatedAt: new Date(),
    })
    .where(eq(checkoutSettlements.id, input.settlementId));

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'checkout_settlement',
    entityId: current.id,
    action: 'approved',
    diff: { finalRefundPaise, deductions },
  });

  scheduleAdminNotificationSync();
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
  return { ok: true };
}

export async function getCheckoutSettlementIdForVacating(
  vacatingRequestId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: checkoutSettlements.id })
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.vacatingRequestId, vacatingRequestId))
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
    WHERE vr.status IN ('approved', 'completed')
      AND cs.id IS NULL
    ORDER BY vr.created_at ASC
  `);

  const created: BackfillCheckoutSettlementRow[] = [];

  for (const row of missing) {
    const noticeGiven = diffDays(row.notice_given_date, row.vacating_date);
    const shortfall = noticeShortfallDays({
      noticeGivenDate: row.notice_given_date,
      vacatingDate: row.vacating_date,
    });
    const noticeDeduction =
      row.deduction_paise > 0
        ? row.deduction_paise
        : noticeShortfallDeduction(row.monthly_rent_paise_snapshot, shortfall);

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
      noticeGivenDays: noticeGiven,
      noticeShortfallDays: shortfall,
      noticeDeductionPaise: snapshot?.penaltyChargePaise ?? noticeDeduction,
      monthlyRentPaiseSnapshot: row.monthly_rent_paise_snapshot,
      depositRequiredPaise: booking?.depositPaise ?? 0,
      electricitySharePaise: snapshot?.electricityDeductionPaise ?? 0,
      electricityUnitRatePaise: snapshot?.electricityUnitCostPaise ?? null,
      electricityUnits: snapshot?.electricityUnits != null ? String(snapshot.electricityUnits) : null,
      damageChargePaise: snapshot?.damageChargePaise ?? 0,
      cleaningChargePaise: snapshot?.cleaningChargePaise ?? 0,
      customChargePaise: snapshot?.customChargePaise ?? 0,
      customChargeLabel: snapshot?.customChargeLabel ?? null,
      deductionsSnapshot: snapshot,
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

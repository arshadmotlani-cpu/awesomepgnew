/**
 * Conservative missing-bill repairs for Health Brain Wave 2.
 * Never invents readings; never touches paid/partial rows.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  electricityBills,
  electricityInvoices,
  meterLogs,
  rooms,
  roomTypes,
} from '@/src/db/schema';
import { createElectricityBill } from '@/src/services/electricityBilling';
import { resolveRoomPreviousMeterReading } from '@/src/services/roomMeterReadingSsot';
import { ensureMonthlyRentInvoice } from '@/src/services/rentInvoices';
import { ensureBillingProfileForBooking } from '@/src/services/residentBillingProfiles';
import { firstOfMonth } from '@/src/services/billing';
import type { RepairExecuteResult } from '@/src/lib/health/repairEngine';

export async function repairMissingRentForBooking(input: {
  bookingId: string;
  billingMonth?: string;
}): Promise<RepairExecuteResult> {
  const billingMonth = firstOfMonth(input.billingMonth ?? new Date());
  const result = await ensureMonthlyRentInvoice({
    bookingId: input.bookingId,
    billingMonth,
  });
  if (!result.ok) {
    return {
      ok: false,
      rowsTouched: 0,
      message: 'error' in result ? result.error : 'ensureMonthlyRentInvoice failed',
    };
  }
  return {
    ok: true,
    rowsTouched: 1,
    diff: {
      bookingId: input.bookingId,
      billingMonth,
      invoiceId: 'invoiceId' in result ? result.invoiceId : null,
    },
  };
}

export async function repairMissingBillingProfileForBooking(
  bookingId: string,
): Promise<RepairExecuteResult> {
  const profile = await ensureBillingProfileForBooking(bookingId);
  if (!profile) {
    return { ok: false, rowsTouched: 0, message: 'Could not ensure billing profile' };
  }
  return {
    ok: true,
    rowsTouched: 1,
    diff: { bookingId, profileId: profile.id },
  };
}

/**
 * Create electricity bill from existing monthly meter reading only.
 * No previous-reading override. Skips if bill already exists or any paid invoice.
 */
export async function repairMissingElectricityBillForRoom(input: {
  roomId: string;
  billingMonth: string;
}): Promise<RepairExecuteResult> {
  const billingMonth = firstOfMonth(input.billingMonth);

  const [room] = await db
    .select({
      id: rooms.id,
      hasAc: roomTypes.hasAc,
    })
    .from(rooms)
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
    .where(eq(rooms.id, input.roomId))
    .limit(1);

  if (!room?.hasAc) {
    return { ok: false, rowsTouched: 0, message: 'Room is not AC-eligible' };
  }

  const [existingBill] = await db
    .select({ id: electricityBills.id })
    .from(electricityBills)
    .where(
      and(
        eq(electricityBills.roomId, input.roomId),
        eq(electricityBills.billingMonth, billingMonth),
        sql`coalesce(${electricityBills.isPipelineTest}, false) = false`,
      ),
    )
    .limit(1);
  if (existingBill) {
    return { ok: true, rowsTouched: 0, skipped: 1, message: 'bill_already_exists' };
  }

  const [paid] = await db
    .select({ id: electricityInvoices.id })
    .from(electricityInvoices)
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .where(
      and(
        eq(electricityBills.roomId, input.roomId),
        eq(electricityBills.billingMonth, billingMonth),
        sql`(${electricityInvoices.paidPaise} > 0 OR ${electricityInvoices.status} IN ('paid', 'partial'))`,
      ),
    )
    .limit(1);
  if (paid) {
    return { ok: false, rowsTouched: 0, message: 'paid_or_partial_exists' };
  }

  const [reading] = await db
    .select({
      id: meterLogs.id,
      units: meterLogs.units,
    })
    .from(meterLogs)
    .where(
      and(
        eq(meterLogs.roomId, input.roomId),
        eq(meterLogs.readingType, 'monthly'),
        sql`date_trunc('month', ${meterLogs.recordedAt}::timestamp)::date = ${billingMonth}::date`,
      ),
    )
    .orderBy(desc(meterLogs.recordedAt))
    .limit(1);

  if (!reading) {
    return { ok: false, rowsTouched: 0, message: 'no_monthly_reading' };
  }

  const baseline = await resolveRoomPreviousMeterReading(input.roomId, {
    beforeBillingMonth: billingMonth,
  });
  const current = Number(reading.units);
  const previous = baseline.previousReadingUnits;
  if (!Number.isFinite(current) || current < previous) {
    return {
      ok: false,
      rowsTouched: 0,
      message: `reading_regression_or_invalid current=${current} previous=${previous}`,
    };
  }

  // Prefer last bill rate when known; else default ₹12/unit.
  const ratePerUnitPaise =
    Number.isFinite(baseline.ratePerUnitPaise) && baseline.ratePerUnitPaise > 0
      ? baseline.ratePerUnitPaise
      : 1200;
  const created = await createElectricityBill({
    roomId: input.roomId,
    billingMonth,
    previousReadingUnits: previous,
    currentReadingUnits: current,
    ratePerUnitPaise,
    allowPreviousReadingOverride: false,
    requestId: `health-brain-elec-${input.roomId}-${billingMonth}`,
    notes: 'Health Brain Wave 2 conservative auto-generate from monthly meter reading',
  });

  if (!created.ok) {
    if (created.kind === 'already_exists') {
      return { ok: true, rowsTouched: 0, skipped: 1, message: 'already_exists' };
    }
    return {
      ok: false,
      rowsTouched: 0,
      message: 'message' in created ? created.message : created.kind,
    };
  }

  return {
    ok: true,
    rowsTouched: 1,
    diff: { billId: created.billId, roomId: input.roomId, billingMonth },
  };
}

export async function markStuckElectricityGenerationJobsFailed(): Promise<RepairExecuteResult> {
  const rows = await db.execute<{ id: string }>(sql`
    UPDATE electricity_bill_generation_jobs
    SET
      status = 'failed',
      finished_at = NOW(),
      error_message = coalesce(error_message, 'Health Brain: stuck running job marked failed')
    WHERE status = 'running'
      AND finished_at IS NULL
      AND started_at < NOW() - INTERVAL '30 minutes'
      AND bill_id IS NULL
    RETURNING id::text AS id
  `);
  const list = Array.isArray(rows) ? rows : [];
  return {
    ok: true,
    rowsTouched: list.length,
    diff: { jobIds: list.map((r) => r.id) },
  };
}

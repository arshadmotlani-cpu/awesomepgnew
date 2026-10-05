/**
 * Projected or committed meter-period electricity to deduct from refundable deposit
 * (vacated residents with checkout on file). Read-only — no bill generation.
 */
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  checkoutSettlements,
  depositLedger,
  electricityBills,
} from '@/src/db/schema';
import { meterLogs } from '@/src/db/schema/meterLogs';
import { firstOfMonth } from '@/src/services/billing';
import {
  METER_PERIOD_ELECTRICITY_DEPOSIT_REASON,
} from '@/src/lib/billing/electricityMeterPeriodResidentSettlement';
import { loadPgElectricityRoomGenerationPreview } from '@/src/lib/billing/pgElectricityGenerationPreview';
import { resolveRoomPreviousMeterReading } from '@/src/services/roomMeterReadingSsot';

export type MeterPeriodElectricityDepositAdjustment = {
  adjustmentPaise: number;
  /** True when amount is already in deposit_ledger. */
  committed: boolean;
  billingMonth: string | null;
};

async function sumCommittedMeterPeriodElectricityDeductions(bookingId: string): Promise<number> {
  const rows = await db
    .select({ amountPaise: depositLedger.amountPaise })
    .from(depositLedger)
    .where(
      and(
        eq(depositLedger.bookingId, bookingId),
        eq(depositLedger.entryKind, 'deducted'),
        eq(depositLedger.reason, METER_PERIOD_ELECTRICITY_DEPOSIT_REASON),
      ),
    );
  let total = 0;
  for (const row of rows) {
    total += Math.abs(Number(row.amountPaise));
  }
  return total;
}

async function resolveOpenBillingMonthForRoom(roomId: string): Promise<string | null> {
  const now = new Date();
  const billingMonth = firstOfMonth(now.toISOString().slice(0, 10));
  const [bill] = await db
    .select({ id: electricityBills.id })
    .from(electricityBills)
    .where(
      and(
        eq(electricityBills.roomId, roomId),
        eq(electricityBills.billingMonth, billingMonth),
        eq(electricityBills.isPipelineTest, false),
      ),
    )
    .limit(1);
  if (!bill) return billingMonth;

  const next = new Date(`${billingMonth.slice(0, 7)}-01T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const nextMonth = firstOfMonth(next.toISOString().slice(0, 10));
  const [nextBill] = await db
    .select({ id: electricityBills.id })
    .from(electricityBills)
    .where(
      and(
        eq(electricityBills.roomId, roomId),
        eq(electricityBills.billingMonth, nextMonth),
        eq(electricityBills.isPipelineTest, false),
      ),
    )
    .limit(1);
  return nextBill ? null : nextMonth;
}

async function resolveAuthoritativeCurrentReadingUnits(input: {
  roomId: string;
  previousReadingUnits: number;
}): Promise<number | null> {
  const [latestLog] = await db
    .select({ units: meterLogs.units })
    .from(meterLogs)
    .where(eq(meterLogs.roomId, input.roomId))
    .orderBy(desc(meterLogs.recordedAt))
    .limit(1);
  const fromLog =
    latestLog?.units != null ? Number(latestLog.units) : null;
  if (fromLog != null && fromLog >= input.previousReadingUnits) return fromLog;
  return null;
}

/**
 * Returns meter-period electricity expected to be deducted from deposit for refund UI.
 * Uses committed ledger rows when present; otherwise projects from open meter period
 * when an authoritative current reading exists (meter log), matching admin settlement preview.
 */
export async function resolveMeterPeriodElectricityDepositAdjustmentForBooking(
  bookingId: string,
): Promise<MeterPeriodElectricityDepositAdjustment | null> {
  const committed = await sumCommittedMeterPeriodElectricityDeductions(bookingId);
  if (committed > 0) {
    return { adjustmentPaise: committed, committed: true, billingMonth: null };
  }

  const [checkout] = await db
    .select({ id: checkoutSettlements.id })
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.bookingId, bookingId))
    .limit(1);
  if (!checkout) return null;

  const [ctx] = await db
    .select({ roomId: beds.roomId, customerId: bookings.customerId })
    .from(bedReservations)
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .where(and(eq(bedReservations.bookingId, bookingId), eq(bedReservations.kind, 'primary')))
    .limit(1);
  if (!ctx?.roomId) return null;

  const billingMonth = await resolveOpenBillingMonthForRoom(ctx.roomId);
  if (!billingMonth) return null;

  const prev = await resolveRoomPreviousMeterReading(ctx.roomId, {
    beforeBillingMonth: billingMonth,
  });
  if (prev.source === 'none') return null;

  const currentReadingUnits = await resolveAuthoritativeCurrentReadingUnits({
    roomId: ctx.roomId,
    previousReadingUnits: prev.previousReadingUnits,
  });
  if (currentReadingUnits == null) return null;

  const preview = await loadPgElectricityRoomGenerationPreview({
    roomId: ctx.roomId,
    billingMonth,
    previousReadingUnits: prev.previousReadingUnits,
    currentReadingUnits,
  });

  const line = preview.settlementPreview?.lines.find((l) => l.customerId === ctx.customerId);
  const adjustmentPaise = line?.depositElectricityDeductionPaise ?? 0;
  if (adjustmentPaise <= 0) return null;

  return {
    adjustmentPaise,
    committed: false,
    billingMonth,
  };
}

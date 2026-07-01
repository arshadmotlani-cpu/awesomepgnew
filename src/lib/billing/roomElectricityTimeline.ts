/**
 * All residents who occupied a room during a billing month — including departed.
 * Used for transparent electricity bill breakdown / occupancy timeline.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  checkoutSettlements,
  customers,
  electricitySettlementLedger,
  vacatingRequests,
} from '@/src/db/schema';
import type { RoomElectricityTimelineRow } from '@/src/lib/billing/electricityBillBreakdownTypes';
import {
  resolveCheckoutElectricityDeductionPaise,
  resolveCheckoutElectricitySharePaise,
} from '@/src/lib/checkout/electricitySettlementCalc';
import { diffDays, formatDate, parseDate } from '@/src/lib/dates';
import { monthBounds } from '@/src/services/billing';

export type { RoomElectricityTimelineRow } from '@/src/lib/billing/electricityBillBreakdownTypes';
export { stayLabelForTimelineRow } from '@/src/lib/billing/electricityBillBreakdownPure';

function activeDaysInMonth(
  lower: string,
  upper: string | null,
  monthStart: Date,
  monthEnd: Date,
): { days: number; stayStart: string; stayEnd: string | null } {
  const aStart = parseDate(lower);
  const aEnd = upper ? parseDate(upper) : monthEnd;
  const intersectStart = aStart > monthStart ? aStart : monthStart;
  const intersectEnd = aEnd < monthEnd ? aEnd : monthEnd;
  if (intersectEnd <= intersectStart) {
    return { days: 0, stayStart: formatDate(monthStart), stayEnd: null };
  }
  const lastOccupied = new Date(intersectEnd.getTime() - 86400000);
  return {
    days: diffDays(intersectStart, intersectEnd),
    stayStart: formatDate(intersectStart),
    stayEnd: formatDate(lastOccupied),
  };
}

export async function loadRoomElectricityTimelineForMonth(input: {
  roomId: string;
  billingMonth: string;
}): Promise<RoomElectricityTimelineRow[]> {
  const { start: monthStart, end: monthEnd } = monthBounds(input.billingMonth);
  const monthStartIso = formatDate(monthStart);
  const monthEndIso = formatDate(monthEnd);
  const daysInMonth = diffDays(monthStart, monthEnd);

  const reservationRows = await db
    .select({
      bookingId: bookings.id,
      customerId: bookings.customerId,
      customerName: customers.fullName,
      reservationStatus: bedReservations.status,
      bookingStatus: bookings.status,
      lower: sql<string>`lower(${bedReservations.stayRange})::text`,
      upper: sql<string | null>`upper(${bedReservations.stayRange})::text`,
    })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(
      and(
        eq(beds.roomId, input.roomId),
        eq(bedReservations.kind, 'primary'),
        eq(bookings.isTest, false),
        eq(customers.isTest, false),
        inArray(bookings.durationMode, ['monthly', 'open_ended', 'fixed_stay']),
        sql`${bedReservations.stayRange} && daterange(${monthStartIso}::date, ${monthEndIso}::date, '[)')`,
      ),
    );

  const ledgerRows = await db
    .select({
      customerId: electricitySettlementLedger.customerId,
      bookingId: electricitySettlementLedger.bookingId,
      amountPaise: electricitySettlementLedger.amountPaise,
      checkoutSettlementId: electricitySettlementLedger.checkoutSettlementId,
      stayPeriodStart: electricitySettlementLedger.stayPeriodStart,
      stayPeriodEnd: electricitySettlementLedger.stayPeriodEnd,
    })
    .from(electricitySettlementLedger)
    .where(
      and(
        eq(electricitySettlementLedger.roomId, input.roomId),
        eq(electricitySettlementLedger.billingMonth, input.billingMonth),
        inArray(electricitySettlementLedger.status, ['collected', 'applied']),
      ),
    );

  const ledgerByBooking = new Map(ledgerRows.map((r) => [r.bookingId, r]));

  const settlementRows = await db
    .select({
      bookingId: checkoutSettlements.bookingId,
      customerId: checkoutSettlements.customerId,
      electricitySharePaise: checkoutSettlements.electricitySharePaise,
      electricityDeductFromDeposit: checkoutSettlements.electricityDeductFromDeposit,
      electricityCalculationMethod: checkoutSettlements.electricityCalculationMethod,
      manualChargePaise: checkoutSettlements.manualChargePaise,
      vacatingDate: vacatingRequests.vacatingDate,
      status: checkoutSettlements.status,
    })
    .from(checkoutSettlements)
    .innerJoin(vacatingRequests, eq(vacatingRequests.id, checkoutSettlements.vacatingRequestId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, checkoutSettlements.bookingId))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(
      and(
        eq(beds.roomId, input.roomId),
        eq(bedReservations.kind, 'primary'),
        sql`${vacatingRequests.vacatingDate} >= ${monthStartIso}::date`,
        sql`${vacatingRequests.vacatingDate} < ${monthEndIso}::date`,
      ),
    );

  const settlementByBooking = new Map(settlementRows.map((r) => [r.bookingId, r]));

  const byBooking = new Map<string, RoomElectricityTimelineRow>();

  for (const row of reservationRows) {
    const { days, stayStart, stayEnd } = activeDaysInMonth(
      row.lower,
      row.upper,
      monthStart,
      monthEnd,
    );
    if (days <= 0) continue;

    const entireMonth = days >= daysInMonth;
    const settlement = settlementByBooking.get(row.bookingId);
    const ledger = ledgerByBooking.get(row.bookingId);
    const vacatedOn = settlement?.vacatingDate ?? null;

    const isActive =
      row.reservationStatus === 'active' &&
      row.bookingStatus === 'confirmed' &&
      !vacatedOn;

    let settlementDetail: RoomElectricityTimelineRow['settlement'] = null;
    if (settlement || ledger) {
      const sharePaise = settlement
        ? resolveCheckoutElectricitySharePaise(settlement)
        : (ledger?.amountPaise ?? 0);
      const fromDeposit = settlement
        ? settlement.electricityDeductFromDeposit !== false
          ? resolveCheckoutElectricityDeductionPaise(settlement)
          : 0
        : 0;
      const ledgerAmount = ledger?.amountPaise ?? fromDeposit;
      const collectedAtCheckout =
        settlement && settlement.electricityDeductFromDeposit === false
          ? sharePaise
          : Math.max(0, ledgerAmount - fromDeposit);

      settlementDetail = {
        electricitySharePaise: sharePaise,
        recoveredFromDepositPaise: fromDeposit,
        collectedDuringCheckoutPaise: collectedAtCheckout,
        creditAppliedToRoomBillPaise: ledgerAmount,
        ledgerAmountPaise: ledgerAmount,
      };
    }

    byBooking.set(row.bookingId, {
      bookingId: row.bookingId,
      customerId: row.customerId,
      customerName: row.customerName,
      reservationStatus: row.reservationStatus,
      bookingStatus: row.bookingStatus,
      lower: row.lower,
      upper: row.upper,
      activeDays: days,
      stayStart: ledger?.stayPeriodStart ?? stayStart,
      stayEnd: ledger?.stayPeriodEnd ?? stayEnd,
      vacatedOn,
      role: isActive ? 'active' : 'departed',
      settlement: settlementDetail,
    });
  }

  return [...byBooking.values()].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'departed' ? -1 : 1;
    return a.stayStart.localeCompare(b.stayStart);
  });
}

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
import { mergeRoomElectricityCoverage } from '@/src/lib/billing/roomElectricityOccupancyCoverage';
import {
  resolveCheckoutElectricityDeductionPaise,
  resolveCheckoutElectricitySharePaise,
} from '@/src/lib/checkout/electricitySettlementCalc';
import { formatDate } from '@/src/lib/dates';
import { monthBounds } from '@/src/services/billing';

export type { RoomElectricityTimelineRow } from '@/src/lib/billing/electricityBillBreakdownTypes';
export { stayLabelForTimelineRow } from '@/src/lib/billing/electricityBillBreakdownPure';

export async function loadRoomElectricityTimelineForMonth(input: {
  roomId: string;
  billingMonth: string;
}): Promise<RoomElectricityTimelineRow[]> {
  const { start: monthStart, end: monthEnd } = monthBounds(input.billingMonth);
  const monthStartIso = formatDate(monthStart);
  const monthEndIso = formatDate(monthEnd);
  const reservationRows = await db
    .select({
      bookingId: bookings.id,
      customerId: bookings.customerId,
      customerName: customers.fullName,
      bedId: beds.id,
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
        inArray(bedReservations.status, ['active', 'completed']),
        inArray(bookings.status, ['confirmed', 'completed', 'superseded']),
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

  const coverage = mergeRoomElectricityCoverage({
    roomId: input.roomId,
    billingMonth: input.billingMonth,
    segments: reservationRows.map((row) => ({
      roomId: input.roomId,
      bookingId: row.bookingId,
      customerId: row.customerId,
      customerName: row.customerName,
      bedId: row.bedId,
      startDate: row.lower,
      endDateExclusive: row.upper,
    })),
  });

  const timeline: RoomElectricityTimelineRow[] = [];
  for (const resident of coverage) {
    const reservationFacts = reservationRows.filter((row) =>
      resident.bookingIds.includes(row.bookingId),
    );
    const settlement = settlementRows.find((row) => resident.bookingIds.includes(row.bookingId));
    const residentLedgerRows = ledgerRows.filter((row) =>
      resident.bookingIds.includes(row.bookingId),
    );
    const ledgerAmount = residentLedgerRows.reduce((sum, row) => sum + row.amountPaise, 0);
    const ledger = residentLedgerRows[0];
    const vacatedOn = settlement?.vacatingDate ?? null;

    const isActive = reservationFacts.some(
      (row) => row.reservationStatus === 'active' && row.bookingStatus === 'confirmed',
    ) && !vacatedOn;

    let settlementDetail: RoomElectricityTimelineRow['settlement'] = null;
    if (settlement || ledger) {
      const sharePaise = settlement
        ? resolveCheckoutElectricitySharePaise(settlement)
        : ledgerAmount;
      const fromDeposit = settlement
        ? settlement.electricityDeductFromDeposit !== false
          ? resolveCheckoutElectricityDeductionPaise(settlement)
          : 0
        : 0;
      const creditAmount = ledgerAmount || fromDeposit;
      const collectedAtCheckout =
        settlement && settlement.electricityDeductFromDeposit === false
          ? sharePaise
          : Math.max(0, creditAmount - fromDeposit);

      settlementDetail = {
        electricitySharePaise: sharePaise,
        recoveredFromDepositPaise: fromDeposit,
        collectedDuringCheckoutPaise: collectedAtCheckout,
        creditAppliedToRoomBillPaise: creditAmount,
        ledgerAmountPaise: creditAmount,
      };
    }

    const representative = reservationFacts.at(-1);
    if (!representative) continue;
    timeline.push({
      bookingId: resident.invoiceBookingId,
      customerId: resident.customerId,
      customerName: resident.customerName ?? 'Resident',
      reservationStatus: representative.reservationStatus,
      bookingStatus: representative.bookingStatus,
      lower: resident.intervals[0]?.startDate ?? resident.stayStart,
      upper: resident.intervals.at(-1)?.endDateExclusive ?? null,
      activeDays: resident.activeDays,
      stayStart: ledger?.stayPeriodStart ?? resident.stayStart,
      stayEnd: ledger?.stayPeriodEnd ?? resident.stayEnd,
      vacatedOn,
      role: isActive ? 'active' : 'departed',
      settlement: settlementDetail,
      occupiedDates: resident.occupiedDates,
      intervals: resident.intervals,
    });
  }

  return timeline.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'departed' ? -1 : 1;
    return a.stayStart.localeCompare(b.stayStart);
  });
}

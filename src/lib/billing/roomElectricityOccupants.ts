/**
 * Room-level electricity occupant discovery for monthly billing.
 * Excludes checkout-settled residents so they never enter allocation or receive invoices.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  checkoutSettlements,
  customers,
  vacatingRequests,
} from '@/src/db/schema';
import type { MonthlyElectricityOccupant } from '@/src/lib/billing/roomElectricityMonthlyAllocation';
import { isPipelineTestResidentEmail } from '@/src/lib/billing/pipelineTestResident';
import { diffDays, formatDate, parseDate } from '@/src/lib/dates';
import { resolveCheckoutElectricityDeductionPaise } from '@/src/lib/checkout/electricitySettlementCalc';
import { monthBounds } from '@/src/services/billing';
import { listCheckoutElectricityLedgerForRoomMonth } from '@/src/services/electricitySettlementLedger';

export type RoomElectricityOccupantRow = MonthlyElectricityOccupant & {
  bedIds: string[];
};

export type RoomElectricityOccupantLoadResult = {
  occupants: RoomElectricityOccupantRow[];
  totalWeight: number;
  daysInMonth: number;
  checkoutCollectedByCustomerId: Map<string, number>;
  excludedCustomerIds: string[];
};

/** Customers whose June electricity was collected at checkout — must not be allocated or invoiced. */
export async function listCheckoutSettledCustomerIdsForRoomMonth(
  roomId: string,
  billingMonth: string,
): Promise<Set<string>> {
  const excluded = new Set<string>();
  const { start: monthStart, end: monthEnd } = monthBounds(billingMonth);
  const monthStartIso = formatDate(monthStart);
  const monthEndIso = formatDate(monthEnd);

  const ledgerRows = await listCheckoutElectricityLedgerForRoomMonth(roomId, billingMonth, {
    status: 'collected',
  });
  for (const row of ledgerRows) {
    if (row.amountPaise > 0) excluded.add(row.customerId);
  }

  const settlementRows = await db
    .select({
      customerId: checkoutSettlements.customerId,
      electricityCalculationMethod: checkoutSettlements.electricityCalculationMethod,
      electricitySharePaise: checkoutSettlements.electricitySharePaise,
      manualChargePaise: checkoutSettlements.manualChargePaise,
      electricityDeductFromDeposit: checkoutSettlements.electricityDeductFromDeposit,
      status: checkoutSettlements.status,
    })
    .from(checkoutSettlements)
    .innerJoin(vacatingRequests, eq(vacatingRequests.id, checkoutSettlements.vacatingRequestId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, checkoutSettlements.bookingId))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(
      and(
        eq(beds.roomId, roomId),
        eq(bedReservations.kind, 'primary'),
        sql`${vacatingRequests.vacatingDate} >= ${monthStartIso}::date`,
        sql`${vacatingRequests.vacatingDate} < ${monthEndIso}::date`,
        sql`${checkoutSettlements.status} IN ('approved', 'refund_pending', 'completed', 'awaiting_admin_review', 'refund_paid')`,
      ),
    );

  for (const row of settlementRows) {
    const deduction = resolveCheckoutElectricityDeductionPaise(row);
    if (deduction > 0) excluded.add(row.customerId);
  }

  return excluded;
}

export async function loadRoomElectricityOccupantsForMonth(input: {
  roomId: string;
  billingMonth: string;
  includeFixedStay?: boolean;
  useProRataByActiveDays?: boolean;
}): Promise<RoomElectricityOccupantLoadResult> {
  const { start: monthStart, end: monthEnd } = monthBounds(input.billingMonth);
  const monthStartIso = formatDate(monthStart);
  const monthEndIso = formatDate(monthEnd);
  const daysInMonth = diffDays(monthStart, monthEnd);

  const checkoutCollectedByCustomerId = new Map<string, number>();
  const checkoutRows = await listCheckoutElectricityLedgerForRoomMonth(
    input.roomId,
    input.billingMonth,
    { status: 'collected' },
  );
  for (const row of checkoutRows) {
    const prev = checkoutCollectedByCustomerId.get(row.customerId) ?? 0;
    checkoutCollectedByCustomerId.set(row.customerId, prev + row.amountPaise);
  }

  const settledCustomerIds = await listCheckoutSettledCustomerIdsForRoomMonth(
    input.roomId,
    input.billingMonth,
  );

  const occupantRows = await db
    .select({
      bookingId: bookings.id,
      customerId: bookings.customerId,
      customerEmail: customers.email,
      bedId: beds.id,
      reservationStatus: bedReservations.status,
      lower: sql<string>`lower(${bedReservations.stayRange})::text`,
      upper: sql<string>`upper(${bedReservations.stayRange})::text`,
    })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(
      and(
        eq(beds.roomId, input.roomId),
        eq(bedReservations.kind, 'primary'),
        inArray(bedReservations.status, ['active', 'completed']),
        inArray(bookings.status, ['confirmed', 'completed']),
        inArray(
          bookings.durationMode,
          input.includeFixedStay
            ? ['monthly', 'open_ended', 'fixed_stay']
            : ['monthly', 'open_ended'],
        ),
        eq(bookings.isTest, false),
        eq(customers.isTest, false),
        sql`${bedReservations.stayRange} && daterange(${monthStartIso}::date, ${monthEndIso}::date, '[)')`,
      ),
    );

  function activeDaysInMonth(lower: string, upper: string | null): number {
    const aStart = parseDate(lower);
    const aEnd = upper ? parseDate(upper) : monthEnd;
    const intersectStart = aStart > monthStart ? aStart : monthStart;
    const intersectEnd = aEnd < monthEnd ? aEnd : monthEnd;
    if (intersectEnd <= intersectStart) return 0;
    return diffDays(intersectStart, intersectEnd);
  }

  const byBooking = new Map<
    string,
    { bookingId: string; customerId: string; bedIds: Set<string>; weight: number }
  >();
  const excludedCustomerIds = new Set<string>();

  for (const row of occupantRows) {
    if (isPipelineTestResidentEmail(row.customerEmail)) continue;
    if (settledCustomerIds.has(row.customerId)) {
      excludedCustomerIds.add(row.customerId);
      continue;
    }

    const bedDays = input.useProRataByActiveDays
      ? activeDaysInMonth(row.lower, row.upper)
      : 1;
    if (bedDays <= 0) continue;

    const cur = byBooking.get(row.bookingId);
    if (cur) {
      cur.bedIds.add(row.bedId);
      cur.weight += bedDays;
    } else {
      byBooking.set(row.bookingId, {
        bookingId: row.bookingId,
        customerId: row.customerId,
        bedIds: new Set([row.bedId]),
        weight: bedDays,
      });
    }
  }

  const occupants: RoomElectricityOccupantRow[] = [...byBooking.values()].map((bk) => ({
    bookingId: bk.bookingId,
    customerId: bk.customerId,
    bedCount: bk.bedIds.size,
    weight: bk.weight,
    bedIds: [...bk.bedIds],
  }));

  const totalWeight = occupants.reduce((sum, o) => sum + o.weight, 0);

  return {
    occupants,
    totalWeight,
    daysInMonth,
    checkoutCollectedByCustomerId,
    excludedCustomerIds: [...excludedCustomerIds],
  };
}

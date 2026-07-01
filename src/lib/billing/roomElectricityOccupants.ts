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
  electricityBills,
  electricityInvoices,
  rooms,
  vacatingRequests,
} from '@/src/db/schema';
import type { MonthlyElectricityOccupant } from '@/src/lib/billing/roomElectricityMonthlyAllocation';
import { isMonthlyElectricityBillableOccupant } from '@/src/lib/billing/electricityOccupancyEligibility';
import { diffDays, formatDate, parseDate } from '@/src/lib/dates';
import { resolveCheckoutElectricityDeductionPaise } from '@/src/lib/checkout/electricitySettlementCalc';
import { paiseToInr } from '@/src/lib/format';
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
        sql`${bedReservations.stayRange} && daterange(${monthStartIso}::date, ${monthEndIso}::date, '[)')`,
        sql`${checkoutSettlements.status} IN ('approved', 'refund_pending', 'completed', 'awaiting_admin_review', 'refund_paid')`,
      ),
    );

  for (const row of settlementRows) {
    const deduction = resolveCheckoutElectricityDeductionPaise(row);
    // Terminal checkout in this room/month — exclude from monthly allocation whether or
    // not electricity was deducted (checkout is the billing boundary for departed residents).
    if (deduction > 0 || row.status === 'completed' || row.status === 'refund_paid') {
      excluded.add(row.customerId);
    }
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
      customerName: customers.fullName,
      residencyStatus: customers.residencyStatus,
      bookingCode: bookings.bookingCode,
      bookingStatus: bookings.status,
      bedId: beds.id,
      bedCode: beds.bedCode,
      reservationId: bedReservations.id,
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
        eq(bedReservations.status, 'active'),
        eq(bookings.status, 'confirmed'),
        inArray(
          bookings.durationMode,
          input.includeFixedStay
            ? ['monthly', 'open_ended', 'fixed_stay']
            : ['monthly', 'open_ended'],
        ),
        eq(bookings.isTest, false),
        eq(customers.isTest, false),
        sql`${customers.residencyStatus} NOT IN ('vacated', 'blocked')`,
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
    if (
      !isMonthlyElectricityBillableOccupant({
        reservationStatus: row.reservationStatus,
        bookingStatus: row.bookingStatus,
        residencyStatus: row.residencyStatus,
        customerEmail: row.customerEmail,
      })
    ) {
      continue;
    }
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

export type ElectricityInvoiceCausation = {
  customerId: string;
  customerName: string;
  invoiceNumber: string | null;
  amountPaise: number;
  billingMonth: string;
  roomNumber: string;
  bedCode: string | null;
  bookingCode: string | null;
  bookingStatus: string | null;
  reservationId: string | null;
  reservationStatus: string | null;
  stayRange: string | null;
  residencyStatus: string | null;
  excludedByCheckoutSettled: boolean;
  excludedByOccupancySsot: boolean;
  includedInCurrentAllocation: boolean;
  causationSummary: string;
};

/** Trace why a customer received (or would receive) a room electricity share. */
export async function traceElectricityInvoiceCausation(input: {
  roomId: string;
  billingMonth: string;
  customerId: string;
}): Promise<ElectricityInvoiceCausation | null> {
  const { start: monthStart, end: monthEnd } = monthBounds(input.billingMonth);
  const monthStartIso = formatDate(monthStart);
  const monthEndIso = formatDate(monthEnd);

  const [customer] = await db
    .select({
      id: customers.id,
      fullName: customers.fullName,
      residencyStatus: customers.residencyStatus,
    })
    .from(customers)
    .where(eq(customers.id, input.customerId))
    .limit(1);
  if (!customer) return null;

  const [invoice] = await db
    .select({
      invoiceNumber: electricityInvoices.invoiceNumber,
      amountPaise: electricityInvoices.amountPaise,
      bedCode: beds.bedCode,
      roomNumber: rooms.roomNumber,
    })
    .from(electricityInvoices)
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .innerJoin(beds, eq(beds.id, electricityInvoices.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(
      and(
        eq(electricityInvoices.customerId, input.customerId),
        eq(electricityBills.roomId, input.roomId),
        eq(electricityInvoices.billingMonth, input.billingMonth),
        sql`${electricityInvoices.status} <> 'cancelled'`,
      ),
    )
    .limit(1);

  const reservations = await db
    .select({
      reservationId: bedReservations.id,
      reservationStatus: bedReservations.status,
      bookingCode: bookings.bookingCode,
      bookingStatus: bookings.status,
      bedCode: beds.bedCode,
      stayRange: sql<string>`${bedReservations.stayRange}::text`,
    })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(
      and(
        eq(bookings.customerId, input.customerId),
        eq(beds.roomId, input.roomId),
        eq(bedReservations.kind, 'primary'),
        sql`${bedReservations.stayRange} && daterange(${monthStartIso}::date, ${monthEndIso}::date, '[)')`,
      ),
    )
    .orderBy(sql`CASE WHEN ${bedReservations.status} = 'active' THEN 0 ELSE 1 END`);

  const primaryReservation = reservations[0] ?? null;
  const settled = await listCheckoutSettledCustomerIdsForRoomMonth(input.roomId, input.billingMonth);
  const load = await loadRoomElectricityOccupantsForMonth({
    roomId: input.roomId,
    billingMonth: input.billingMonth,
    includeFixedStay: true,
    useProRataByActiveDays: true,
  });
  const includedInCurrentAllocation = load.occupants.some((o) => o.customerId === input.customerId);
  const excludedByCheckoutSettled = settled.has(input.customerId);
  const excludedByOccupancySsot = primaryReservation
    ? !isMonthlyElectricityBillableOccupant({
        reservationStatus: primaryReservation.reservationStatus,
        bookingStatus: primaryReservation.bookingStatus,
        residencyStatus: customer.residencyStatus,
        customerEmail: null,
      })
    : true;

  let causationSummary: string;
  if (!invoice && !primaryReservation) {
    causationSummary = 'No June invoice and no primary reservation overlapping the billing month.';
  } else if (invoice && primaryReservation?.reservationStatus === 'completed') {
    causationSummary =
      `Invoice ${invoice.invoiceNumber} for ${paiseToInr(invoice.amountPaise)} was generated because ` +
      `bed_reservations.id=${primaryReservation.reservationId} (status=completed, booking ${primaryReservation.bookingCode}) ` +
      `had stay_range ${primaryReservation.stayRange} overlapping ${input.billingMonth}. ` +
      `The legacy loader counted completed reservations; occupancy SSOT requires status=active.`;
  } else if (invoice && excludedByOccupancySsot) {
    causationSummary =
      `Invoice ${invoice.invoiceNumber} exists but the customer fails occupancy SSOT ` +
      `(reservation=${primaryReservation?.reservationStatus ?? 'none'}, booking=${primaryReservation?.bookingStatus ?? 'none'}, ` +
      `residency=${customer.residencyStatus}).`;
  } else if (invoice) {
    causationSummary =
      `Invoice ${invoice.invoiceNumber} for ${paiseToInr(invoice.amountPaise)} tied to ` +
      `bed_reservations.id=${primaryReservation?.reservationId ?? 'unknown'} on bed ${invoice.bedCode}.`;
  } else {
    causationSummary = 'No active invoice; customer is not in the corrected allocation pool.';
  }

  return {
    customerId: customer.id,
    customerName: customer.fullName,
    invoiceNumber: invoice?.invoiceNumber ?? null,
    amountPaise: invoice?.amountPaise ?? 0,
    billingMonth: input.billingMonth,
    roomNumber: invoice?.roomNumber ?? '',
    bedCode: primaryReservation?.bedCode ?? invoice?.bedCode ?? null,
    bookingCode: primaryReservation?.bookingCode ?? null,
    bookingStatus: primaryReservation?.bookingStatus ?? null,
    reservationId: primaryReservation?.reservationId ?? null,
    reservationStatus: primaryReservation?.reservationStatus ?? null,
    stayRange: primaryReservation?.stayRange ?? null,
    residencyStatus: customer.residencyStatus,
    excludedByCheckoutSettled,
    excludedByOccupancySsot,
    includedInCurrentAllocation,
    causationSummary,
  };
}

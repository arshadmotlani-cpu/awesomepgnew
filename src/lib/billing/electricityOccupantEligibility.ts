/**
 * Who should receive a monthly electricity invoice for a bed in a billing month.
 * Aligns billing with occupancy SSOT — excludes cancelled/hold reservations.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, beds, bookings, customers } from '@/src/db/schema';
import { addMonths, formatDate, parseDate } from '@/src/lib/dates';
import { isPipelineTestResidentEmail } from '@/src/lib/billing/pipelineTestResident';
import { firstOfMonth } from '@/src/services/billing';

export type BedMonthOccupant = {
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  bookingId: string;
  bookingCode: string;
  bedId: string;
  reservationStatus: string;
  bookingStatus: string;
};

function billingMonthRange(billingMonth: string): { monthStartIso: string; monthEndIso: string } {
  const monthStart = parseDate(firstOfMonth(billingMonth));
  const monthEnd = addMonths(monthStart, 1);
  return {
    monthStartIso: formatDate(monthStart),
    monthEndIso: formatDate(monthEnd),
  };
}

/** Primary occupants eligible for monthly electricity on a bed during a billing month. */
export async function listBedOccupantsForBillingMonth(
  bedId: string,
  billingMonth: string,
  opts?: { includeFixedStay?: boolean },
): Promise<BedMonthOccupant[]> {
  const { monthStartIso, monthEndIso } = billingMonthRange(billingMonth);
  const durationModes = opts?.includeFixedStay
    ? (['monthly', 'open_ended', 'fixed_stay'] as const)
    : (['monthly', 'open_ended'] as const);

  const rows = await db
    .select({
      customerId: bookings.customerId,
      customerName: customers.fullName,
      customerEmail: customers.email,
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      bedId: beds.id,
      reservationStatus: bedReservations.status,
      bookingStatus: bookings.status,
      isTest: bookings.isTest,
      customerIsTest: customers.isTest,
    })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(
      and(
        eq(bedReservations.bedId, bedId),
        eq(bedReservations.kind, 'primary'),
        inArray(bedReservations.status, ['active', 'completed']),
        inArray(bookings.status, ['confirmed', 'completed']),
        inArray(bookings.durationMode, [...durationModes]),
        eq(bookings.isTest, false),
        eq(customers.isTest, false),
        sql`${bedReservations.stayRange} && daterange(${monthStartIso}::date, ${monthEndIso}::date, '[)')`,
      ),
    )
    .orderBy(
      sql`CASE WHEN ${bedReservations.status} = 'active' THEN 0 ELSE 1 END`,
      desc(bedReservations.updatedAt),
    );

  return rows
    .filter((r) => !isPipelineTestResidentEmail(r.customerEmail))
    .map((r) => ({
      customerId: r.customerId,
      customerName: r.customerName,
      customerEmail: r.customerEmail,
      bookingId: r.bookingId,
      bookingCode: r.bookingCode,
      bedId: r.bedId,
      reservationStatus: r.reservationStatus,
      bookingStatus: r.bookingStatus,
    }));
}

/** Canonical occupant for a bed+month — null when vacant or ambiguous. */
export async function resolveBedOccupantForBillingMonth(
  bedId: string,
  billingMonth: string,
  opts?: { includeFixedStay?: boolean },
): Promise<BedMonthOccupant | null> {
  const occupants = await listBedOccupantsForBillingMonth(bedId, billingMonth, opts);
  if (occupants.length === 0) return null;
  const customerIds = new Set(occupants.map((o) => o.customerId));
  if (customerIds.size > 1) return null;
  return occupants[0] ?? null;
}

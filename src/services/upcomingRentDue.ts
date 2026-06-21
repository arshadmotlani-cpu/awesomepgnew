/**
 * Upcoming rent due dates — assigned residents sorted by nearest due date.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgs,
  residentBillingProfiles,
  rooms,
} from '@/src/db/schema';
import {
  isProductionBookingFilter,
  isProductionCustomerFilter,
} from '@/src/lib/billing/productionDataFilter';
import { sortByRoomBed } from '@/src/lib/billing/roomBedSort';
import { diffDays, formatDate } from '@/src/lib/dates';
import {
  OCCUPANCY_PLACEHOLDER_EMAIL,
  OCCUPANCY_PLACEHOLDER_NAME,
  OCCUPANCY_PLACEHOLDER_PHONE,
} from '@/src/lib/occupancySqlFilters';
import { computeNextRentDueDate } from '@/src/services/billing';

export type UpcomingRentDueRow = {
  customerId: string;
  customerName: string;
  phone: string;
  bookingId: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  moveInDate: string;
  billingDay: number;
  monthlyRentPaise: number;
  nextDueDate: string;
  daysRemaining: number;
  openInvoiceId: string | null;
};

const assignedFilters = and(
  isProductionBookingFilter(),
  isProductionCustomerFilter(),
  sql`${customers.phone} <> ${OCCUPANCY_PLACEHOLDER_PHONE}`,
  sql`${customers.email} <> ${OCCUPANCY_PLACEHOLDER_EMAIL}`,
  sql`${customers.fullName} <> ${OCCUPANCY_PLACEHOLDER_NAME}`,
  eq(bookings.status, 'confirmed'),
  eq(customers.residencyStatus, 'active'),
  eq(bedReservations.kind, 'primary'),
  eq(bedReservations.status, 'active'),
  sql`CURRENT_DATE <@ ${bedReservations.stayRange}`,
);

export async function listUpcomingRentDueDates(opts?: {
  pgId?: string;
  limit?: number;
}): Promise<UpcomingRentDueRow[]> {
  const today = formatDate(new Date());
  const limit = opts?.limit ?? 500;

  const rows = await db
    .select({
      customerId: customers.id,
      customerName: customers.fullName,
      phone: customers.phone,
      bookingId: bookings.id,
      pgId: pgs.id,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
      moveInDate: sql<string>`to_char(lower(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
      billingDay: sql<number>`coalesce(${residentBillingProfiles.billingDay}, 5)::int`,
      monthlyRentPaise: sql<number>`coalesce(${residentBillingProfiles.rentAmountPaise}, 0)::bigint::int`,
      openRentDueDate: sql<string | null>`(
        SELECT ri.due_date::text
        FROM rent_invoices ri
        WHERE ri.booking_id = ${bookings.id}
          AND ri.is_adhoc = false
          AND ri.status IN ('pending', 'overdue')
        ORDER BY ri.due_date ASC
        LIMIT 1
      )`,
      openInvoiceId: sql<string | null>`(
        SELECT ri.id::text
        FROM rent_invoices ri
        WHERE ri.booking_id = ${bookings.id}
          AND ri.is_adhoc = false
          AND ri.status IN ('pending', 'overdue')
        ORDER BY ri.due_date ASC
        LIMIT 1
      )`,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .leftJoin(residentBillingProfiles, eq(residentBillingProfiles.bookingId, bookings.id))
    .where(
      and(
        assignedFilters,
        sql`${pgs.archivedAt} IS NULL`,
        opts?.pgId ? eq(pgs.id, opts.pgId) : sql`true`,
      ),
    )
    .limit(limit);

  const mapped: UpcomingRentDueRow[] = rows.map((r) => {
    const nextDueDate = computeNextRentDueDate({
      moveInDate: r.moveInDate,
      billingDay: r.billingDay,
      openInvoiceDueDate: r.openRentDueDate,
    });
    return {
      customerId: r.customerId,
      customerName: r.customerName,
      phone: r.phone,
      bookingId: r.bookingId,
      pgId: r.pgId,
      pgName: r.pgName,
      roomNumber: r.roomNumber,
      bedCode: r.bedCode,
      moveInDate: r.moveInDate,
      billingDay: r.billingDay,
      monthlyRentPaise: r.monthlyRentPaise,
      nextDueDate,
      daysRemaining: diffDays(today, nextDueDate),
      openInvoiceId: r.openInvoiceId,
    };
  });

  mapped.sort((a, b) => {
    const dueCmp = a.nextDueDate.localeCompare(b.nextDueDate);
    if (dueCmp !== 0) return dueCmp;
    return sortByRoomBed([a, b])[0] === a ? -1 : 1;
  });

  return mapped;
}

export function groupUpcomingRentDueByDate(
  rows: UpcomingRentDueRow[],
): Array<{ dueDate: string; residents: UpcomingRentDueRow[] }> {
  const groups: Array<{ dueDate: string; residents: UpcomingRentDueRow[] }> = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.dueDate === row.nextDueDate) {
      last.residents.push(row);
    } else {
      groups.push({ dueDate: row.nextDueDate, residents: [row] });
    }
  }
  for (const g of groups) {
    g.residents = sortByRoomBed(g.residents);
  }
  return groups;
}

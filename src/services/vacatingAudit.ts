/**
 * Vacating workflow integrity audit — occupancy, beds, bookings, financial hooks.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  vacatingRequests,
} from '@/src/db/schema';
import { formatDate } from '@/src/lib/dates';
import { reconcileBookingOccupancy } from '@/src/lib/occupancySync';
import { clearBedAdminMarks } from '@/src/services/bookingAdminOps';

export type VacatingAuditIssue = {
  code: string;
  bookingId: string;
  bookingCode: string;
  customerName: string;
  detail: string;
};

export type VacatingAuditReport = {
  asOf: string;
  issues: VacatingAuditIssue[];
  checked: number;
  pass: boolean;
};

export async function runVacatingAudit(): Promise<VacatingAuditReport> {
  const today = formatDate(new Date());
  const issues: VacatingAuditIssue[] = [];

  const requests = await db
    .select({
      id: vacatingRequests.id,
      bookingId: vacatingRequests.bookingId,
      status: vacatingRequests.status,
      vacatingDate: vacatingRequests.vacatingDate,
      bookingCode: bookings.bookingCode,
      bookingStatus: bookings.status,
      customerName: customers.fullName,
    })
    .from(vacatingRequests)
    .innerJoin(bookings, eq(bookings.id, vacatingRequests.bookingId))
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(sql`${vacatingRequests.status} IN ('pending', 'approved', 'completed')`);

  for (const row of requests) {
    const [reservation] = await db
      .select({
        bedId: bedReservations.bedId,
        status: bedReservations.status,
        manualOccupied: beds.manualOccupied,
      })
      .from(bedReservations)
      .innerJoin(beds, eq(beds.id, bedReservations.bedId))
      .where(
        and(
          eq(bedReservations.bookingId, row.bookingId),
          eq(bedReservations.kind, 'primary'),
        ),
      )
      .limit(1);

    if (row.status === 'completed' && row.bookingStatus !== 'completed') {
      issues.push({
        code: 'completed_booking_mismatch',
        bookingId: row.bookingId,
        bookingCode: row.bookingCode,
        customerName: row.customerName,
        detail: `Vacating completed but booking status is ${row.bookingStatus}.`,
      });
    }

    if (row.status === 'completed' && reservation?.status === 'active') {
      issues.push({
        code: 'completed_active_reservation',
        bookingId: row.bookingId,
        bookingCode: row.bookingCode,
        customerName: row.customerName,
        detail: 'Vacating completed but primary bed reservation is still active.',
      });
    }

    if (
      row.status === 'approved' &&
      row.vacatingDate &&
      row.vacatingDate < today &&
      row.bookingStatus === 'confirmed'
    ) {
      issues.push({
        code: 'approved_past_due',
        bookingId: row.bookingId,
        bookingCode: row.bookingCode,
        customerName: row.customerName,
        detail: `Approved vacating date ${row.vacatingDate} passed; booking still confirmed.`,
      });
    }

    if (row.status === 'pending' && row.bookingStatus === 'completed') {
      issues.push({
        code: 'pending_on_completed_booking',
        bookingId: row.bookingId,
        bookingCode: row.bookingCode,
        customerName: row.customerName,
        detail: 'Pending vacating notice on already-completed booking.',
      });
    }
  }

  const ghostOccupiedAfterVacating = await db.execute<{
    booking_id: string;
    booking_code: string;
    customer_name: string;
  }>(sql`
    SELECT b.id AS booking_id, b.booking_code, c.full_name AS customer_name
    FROM bookings b
    INNER JOIN customers c ON c.id = b.customer_id
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    INNER JOIN beds bd ON bd.id = br.bed_id
    WHERE b.status = 'completed'
      AND br.status = 'active'
      AND bd.manual_occupied = true
      AND CURRENT_DATE <@ br.stay_range
    LIMIT 20
  `);

  for (const row of Array.from(ghostOccupiedAfterVacating)) {
    issues.push({
      code: 'ghost_occupied_after_vacating',
      bookingId: row.booking_id,
      bookingCode: row.booking_code,
      customerName: row.customer_name,
      detail: 'Completed booking still has manual occupied bed flag.',
    });
  }

  return {
    asOf: new Date().toISOString(),
    issues,
    checked: requests.length,
    pass: issues.length === 0,
  };
}

/** Emergency repair for vacating/occupancy drift detected by audit. */
export async function repairVacatingAuditIssues(
  issues: VacatingAuditIssue[],
): Promise<{ repaired: number; messages: string[] }> {
  const messages: string[] = [];
  let repaired = 0;

  for (const issue of issues) {
    if (issue.code === 'completed_active_reservation' && issue.bookingId) {
      await db
        .update(bedReservations)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(
          and(
            eq(bedReservations.bookingId, issue.bookingId),
            sql`${bedReservations.status} IN ('hold', 'active')`,
          ),
        );
      await db
        .update(bookings)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(bookings.id, issue.bookingId));
      await reconcileBookingOccupancy(issue.bookingId);
      messages.push(`Closed reservations for ${issue.bookingCode}`);
      repaired += 1;
    }

    if (issue.code === 'ghost_occupied_after_vacating' && issue.bookingId) {
      const bedRows = await db
        .select({ bedId: bedReservations.bedId })
        .from(bedReservations)
        .where(eq(bedReservations.bookingId, issue.bookingId));
      for (const row of bedRows) {
        await clearBedAdminMarks(row.bedId);
      }
      messages.push(`Cleared manual marks for ${issue.bookingCode}`);
      repaired += 1;
    }

    if (issue.code === 'approved_past_due' && issue.bookingId) {
      messages.push(
        `${issue.bookingCode}: approved past due — complete checkout in admin vacating panel`,
      );
    }
  }

  return { repaired, messages };
}

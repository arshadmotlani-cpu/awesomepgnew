/**
 * Audit invoice ↔ booking ↔ occupancy consistency (ghost bookings / orphan invoices).
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  financialInvoices,
  floors,
  pgs,
  rentInvoices,
  rooms,
} from '@/src/db/schema';
import { bedOccupiedTodayExistsSql } from '@/src/lib/occupancySsot';
import { formatDate } from '@/src/lib/dates';

export type GhostBookingIssue = {
  kind:
    | 'assigned_no_invoice'
    | 'invoice_no_booking'
    | 'booking_no_invoice'
    | 'occupied_no_active_booking';
  detail: string;
  bookingId?: string;
  bookingCode?: string;
  customerId?: string;
  customerName?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  bedId?: string;
  bedCode?: string;
  pgName?: string;
};

export type GhostBookingAuditReport = {
  asOf: string;
  ghostIssues: GhostBookingIssue[];
  summary: {
    totalIssues: number;
    assignedNoInvoice: number;
    invoiceNoBooking: number;
    bookingNoInvoice: number;
    occupiedNoActiveBooking: number;
  };
};

export async function runGhostBookingAudit(bedAuditIssueCount = 0): Promise<GhostBookingAuditReport> {
  const asOf = formatDate(new Date());
  const ghostIssues: GhostBookingIssue[] = [];

  const assignedNoInvoice = await db.execute<{
    booking_id: string;
    booking_code: string;
    customer_id: string;
    customer_name: string;
    bed_code: string;
    pg_name: string;
  }>(sql`
    SELECT
      b.id::text AS booking_id,
      b.booking_code AS booking_code,
      b.customer_id::text AS customer_id,
      c.full_name AS customer_name,
      bd.bed_code,
      p.name AS pg_name
    FROM bookings b
    INNER JOIN customers c ON c.id = b.customer_id
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary' AND br.status = 'active'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE b.status = 'confirmed'
      AND b.created_via = 'admin'
      AND CURRENT_DATE <@ br.stay_range
      AND NOT EXISTS (
        SELECT 1 FROM rent_invoices ri
        WHERE ri.booking_id = b.id AND ri.status NOT IN ('cancelled')
      )
      AND NOT EXISTS (
        SELECT 1 FROM financial_invoices fi
        WHERE fi.booking_id = b.id AND fi.status NOT IN ('cancelled', 'refunded')
      )
  `);

  for (const row of assignedNoInvoice) {
    ghostIssues.push({
      kind: 'assigned_no_invoice',
      detail: `${row.customer_name} assigned to ${row.pg_name} · ${row.bed_code} with no active invoice`,
      bookingId: row.booking_id,
      bookingCode: row.booking_code,
      customerId: row.customer_id,
      customerName: row.customer_name,
      bedCode: row.bed_code,
      pgName: row.pg_name,
    });
  }

  const invoiceNoBooking = await db
    .select({
      id: financialInvoices.id,
      invoiceNumber: financialInvoices.invoiceNumber,
      customerId: financialInvoices.customerId,
    })
    .from(financialInvoices)
    .where(
      and(
        sql`${financialInvoices.bookingId} IS NULL`,
        inArray(financialInvoices.status, ['sent', 'overdue', 'paid', 'partial', 'draft']),
        inArray(financialInvoices.invoiceType, ['rent', 'combined', 'deposit']),
      ),
    )
    .limit(200);

  for (const inv of invoiceNoBooking) {
    const [customer] = await db
      .select({ fullName: customers.fullName })
      .from(customers)
      .where(eq(customers.id, inv.customerId))
      .limit(1);
    ghostIssues.push({
      kind: 'invoice_no_booking',
      detail: `Invoice ${inv.invoiceNumber} has no linked booking`,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerId: inv.customerId,
      customerName: customer?.fullName,
    });
  }

  const bookingNoInvoice = await db.execute<{
    booking_id: string;
    booking_code: string;
    customer_name: string;
    subtotal_paise: number;
  }>(sql`
    SELECT b.id::text AS booking_id, b.booking_code, c.full_name AS customer_name, b.subtotal_paise
    FROM bookings b
    INNER JOIN customers c ON c.id = b.customer_id
    WHERE b.status = 'confirmed'
      AND b.subtotal_paise > 0
      AND b.created_at > NOW() - INTERVAL '90 days'
      AND NOT EXISTS (
        SELECT 1 FROM rent_invoices ri WHERE ri.booking_id = b.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM financial_invoices fi WHERE fi.booking_id = b.id
      )
  `);

  for (const row of bookingNoInvoice) {
    ghostIssues.push({
      kind: 'booking_no_invoice',
      detail: `Booking ${row.booking_code} (${row.customer_name}) has rent due but no invoice row`,
      bookingId: row.booking_id,
      bookingCode: row.booking_code,
      customerName: row.customer_name,
    });
  }

  const occupiedNoBooking = await db
    .select({
      bedId: beds.id,
      bedCode: beds.bedCode,
      pgName: pgs.name,
    })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        sql`${beds.archivedAt} IS NULL`,
        sql`NOT (${bedOccupiedTodayExistsSql})`,
        sql`EXISTS (
          SELECT 1 FROM bed_reservations br
          INNER JOIN bookings bk ON bk.id = br.booking_id
          WHERE br.bed_id = ${beds.id}
            AND br.status = 'active'
            AND br.kind = 'primary'
            AND CURRENT_DATE <@ br.stay_range
            AND bk.status NOT IN ('confirmed')
        )`,
      ),
    )
    .limit(100);

  for (const bed of occupiedNoBooking) {
    ghostIssues.push({
      kind: 'occupied_no_active_booking',
      detail: `${bed.pgName} · bed ${bed.bedCode} has active reservation but booking is not confirmed`,
      bedId: bed.bedId,
      bedCode: bed.bedCode,
      pgName: bed.pgName,
    });
  }

  const counts = {
    assignedNoInvoice: ghostIssues.filter((i) => i.kind === 'assigned_no_invoice').length,
    invoiceNoBooking: ghostIssues.filter((i) => i.kind === 'invoice_no_booking').length,
    bookingNoInvoice: ghostIssues.filter((i) => i.kind === 'booking_no_invoice').length,
    occupiedNoActiveBooking: ghostIssues.filter((i) => i.kind === 'occupied_no_active_booking').length,
  };

  return {
    asOf,
    ghostIssues,
    summary: {
      totalIssues: ghostIssues.length + bedAuditIssueCount,
      ...counts,
    },
  };
}

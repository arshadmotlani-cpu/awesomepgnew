/**
 * Rent Payment Map — bulk loader for PG → floor → room → bed rent status.
 * Engine layer: structure + occupancy + billing projection (no per-bed DB round-trips).
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { listPgs } from '@/src/db/queries/admin';
import { paymentProofRejections, rentInvoices } from '@/src/db/schema';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import {
  aggregateRentPaymentMapRoomSummary,
  aggregateRentPaymentMapSummary,
  classifyRentPaymentMapBed,
  rentPaymentMapBedHref,
  type RentPaymentMapRoomSummary,
  type RentPaymentMapStatus,
  type RentPaymentMapSummary,
} from '@/src/lib/billing/rentPaymentMapStatus';
import { formatDate } from '@/src/lib/dates';
import { firstOfMonth, monthBounds } from '@/src/services/billing';
import { projectInvoice, type RentInvoiceProjectInput } from '@/src/services/rentInvoices';

export type RentPaymentMapBed = {
  bedId: string;
  bedCode: string;
  status: RentPaymentMapStatus;
  residentName: string | null;
  customerId: string | null;
  bookingId: string | null;
  invoiceId: string | null;
  clickHref: string;
};

export type RentPaymentMapRoom = {
  roomId: string;
  roomNumber: string;
  summary: RentPaymentMapRoomSummary;
  beds: RentPaymentMapBed[];
};

export type RentPaymentMapFloor = {
  floorNumber: number;
  floorLabel: string;
  rooms: RentPaymentMapRoom[];
};

export type RentPaymentMapPg = {
  pgId: string;
  pgName: string;
  floors: RentPaymentMapFloor[];
};

export type RentPaymentMapData = {
  billingMonth: string;
  pgs: RentPaymentMapPg[];
  summary: RentPaymentMapSummary;
};

type StructureRow = {
  pg_id: string;
  pg_name: string;
  floor_number: number;
  floor_label: string;
  room_id: string;
  room_number: string;
  bed_id: string;
  bed_code: string;
  customer_id: string | null;
  customer_name: string | null;
  booking_id: string | null;
};

async function resolveAccessiblePgIds(
  session: AdminSession,
  pgId?: string,
): Promise<Array<{ id: string; name: string }>> {
  const pgsResult = await listPgs();
  if (!pgsResult.ok) return [];

  const accessible = pgsResult.data.filter((pg) =>
    adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pg.id),
  );

  if (pgId) {
    const match = accessible.find((pg) => pg.id === pgId);
    return match ? [{ id: match.id, name: match.name }] : [];
  }

  return accessible.map((pg) => ({ id: pg.id, name: pg.name }));
}

async function loadStructureRows(
  pgIds: string[],
  billingMonth: string,
): Promise<StructureRow[]> {
  if (pgIds.length === 0) return [];

  const month = firstOfMonth(billingMonth);
  const { start, end } = monthBounds(month);
  const monthStartIso = formatDate(start);
  const monthEndIso = formatDate(end);

  const rows = await db.execute<StructureRow>(sql`
    SELECT
      p.id::text AS pg_id,
      p.name AS pg_name,
      f.floor_number,
      coalesce(f.label, 'Floor ' || f.floor_number::text) AS floor_label,
      r.id::text AS room_id,
      r.room_number,
      b.id::text AS bed_id,
      b.bed_code,
      occ.customer_id::text,
      occ.customer_name,
      occ.booking_id::text
    FROM pgs p
    INNER JOIN floors f ON f.pg_id = p.id AND f.archived_at IS NULL
    INNER JOIN rooms r ON r.floor_id = f.id AND r.archived_at IS NULL
    INNER JOIN beds b ON b.room_id = r.id AND b.archived_at IS NULL
    LEFT JOIN LATERAL (
      SELECT
        c.id AS customer_id,
        c.full_name AS customer_name,
        bk.id AS booking_id
      FROM bed_reservations br
      INNER JOIN bookings bk ON bk.id = br.booking_id
      INNER JOIN customers c ON c.id = bk.customer_id
      WHERE br.bed_id = b.id
        AND br.status = 'active'
        AND br.kind = 'primary'
        AND bk.status = 'confirmed'
        AND bk.is_test = false
        AND c.is_test = false
        AND bk.duration_mode IN ('monthly', 'open_ended')
        AND br.stay_range && daterange(${monthStartIso}::date, ${monthEndIso}::date, '[)')
      ORDER BY lower(br.stay_range) DESC
      LIMIT 1
    ) occ ON true
    WHERE p.id = ANY(${sql.raw(`'{${pgIds.join(',')}}'::uuid[]`)})
      AND p.archived_at IS NULL
    ORDER BY p.name ASC, f.floor_number ASC, r.room_number ASC, b.bed_code ASC
  `);

  return rows;
}

async function loadRentInvoicesForBookings(
  bookingIds: string[],
  billingMonth: string,
): Promise<Map<string, RentInvoiceProjectInput>> {
  if (bookingIds.length === 0) return new Map();

  const month = firstOfMonth(billingMonth);
  const rows = await db
    .select()
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.billingMonth, month),
        eq(rentInvoices.isAdhoc, false),
        inArray(rentInvoices.bookingId, bookingIds),
      ),
    );

  const byBooking = new Map<string, RentInvoiceProjectInput>();
  for (const row of rows) {
    byBooking.set(row.bookingId, row);
  }
  return byBooking;
}

async function loadActiveRejectionsForInvoices(
  invoiceIds: string[],
): Promise<Set<string>> {
  if (invoiceIds.length === 0) return new Set();

  const rows = await db
    .select({ entityId: paymentProofRejections.entityId })
    .from(paymentProofRejections)
    .where(
      and(
        eq(paymentProofRejections.entityType, 'rent_invoice'),
        eq(paymentProofRejections.status, 'active'),
        inArray(paymentProofRejections.entityId, invoiceIds),
      ),
    );

  return new Set(rows.map((r) => r.entityId));
}

function buildBed(
  row: StructureRow,
  invoice: RentInvoiceProjectInput | undefined,
  rejectedInvoiceIds: Set<string>,
): RentPaymentMapBed {
  const isOccupiedInMonth = Boolean(row.booking_id && row.customer_id);
  const projected = invoice ? projectInvoice(invoice) : null;
  const hasRejection = invoice ? rejectedInvoiceIds.has(invoice.id) : false;

  const status = classifyRentPaymentMapBed({
    isOccupiedInMonth,
    projected,
    hasActiveRejectionWithoutProof: hasRejection,
    paymentProofUrl: invoice?.paymentProofUrl ?? null,
  });

  const clickHref = rentPaymentMapBedHref({
    pgId: row.pg_id,
    bedId: row.bed_id,
    customerId: row.customer_id,
    invoiceId: invoice?.id ?? null,
    status,
  });

  return {
    bedId: row.bed_id,
    bedCode: row.bed_code,
    status,
    residentName: row.customer_name,
    customerId: row.customer_id,
    bookingId: row.booking_id,
    invoiceId: invoice?.id ?? null,
    clickHref,
  };
}

export async function loadRentPaymentMap(
  session: AdminSession,
  opts: { billingMonth: string; pgId?: string },
): Promise<RentPaymentMapData> {
  const billingMonth = firstOfMonth(opts.billingMonth);
  const accessiblePgs = await resolveAccessiblePgIds(session, opts.pgId);
  const pgIds = accessiblePgs.map((pg) => pg.id);

  if (pgIds.length === 0) {
    return {
      billingMonth,
      pgs: [],
      summary: {
        totalOccupied: 0,
        paid: 0,
        paymentSubmitted: 0,
        notPaid: 0,
        availableBeds: 0,
      },
    };
  }

  const structureRows = await loadStructureRows(pgIds, billingMonth);
  const bookingIds = [
    ...new Set(structureRows.map((r) => r.booking_id).filter((id): id is string => Boolean(id))),
  ];

  const invoicesByBooking = await loadRentInvoicesForBookings(bookingIds, billingMonth);
  const invoiceIds = [...invoicesByBooking.values()].map((inv) => inv.id);
  const rejectedInvoiceIds = await loadActiveRejectionsForInvoices(invoiceIds);

  const pgMap = new Map<
    string,
    {
      pgName: string;
      floors: Map<
        number,
        { floorLabel: string; rooms: Map<string, { roomNumber: string; beds: RentPaymentMapBed[] }> }
      >;
    }
  >();

  const allBeds: RentPaymentMapBed[] = [];

  for (const row of structureRows) {
    const invoice = row.booking_id ? invoicesByBooking.get(row.booking_id) : undefined;
    const bed = buildBed(row, invoice, rejectedInvoiceIds);
    allBeds.push(bed);

    let pgEntry = pgMap.get(row.pg_id);
    if (!pgEntry) {
      pgEntry = { pgName: row.pg_name, floors: new Map() };
      pgMap.set(row.pg_id, pgEntry);
    }

    let floorEntry = pgEntry.floors.get(row.floor_number);
    if (!floorEntry) {
      floorEntry = { floorLabel: row.floor_label, rooms: new Map() };
      pgEntry.floors.set(row.floor_number, floorEntry);
    }

    let roomEntry = floorEntry.rooms.get(row.room_id);
    if (!roomEntry) {
      roomEntry = { roomNumber: row.room_number, beds: [] };
      floorEntry.rooms.set(row.room_id, roomEntry);
    }
    roomEntry.beds.push(bed);
  }

  const pgs: RentPaymentMapPg[] = accessiblePgs
    .filter((pg) => pgMap.has(pg.id))
    .map((pg) => {
      const entry = pgMap.get(pg.id)!;
      const floors: RentPaymentMapFloor[] = [...entry.floors.entries()]
        .sort(([a], [b]) => a - b)
        .map(([floorNumber, floor]) => ({
          floorNumber,
          floorLabel: floor.floorLabel,
          rooms: [...floor.rooms.entries()].map(([roomId, room]) => ({
            roomId,
            roomNumber: room.roomNumber,
            summary: aggregateRentPaymentMapRoomSummary(room.beds),
            beds: room.beds,
          })),
        }));

      return { pgId: pg.id, pgName: entry.pgName, floors };
    });

  return {
    billingMonth,
    pgs,
    summary: aggregateRentPaymentMapSummary(allBeds),
  };
}

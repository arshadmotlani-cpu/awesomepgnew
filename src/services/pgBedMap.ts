import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';

export type PgBedMapOccupant = {
  customerId: string;
  customerName: string;
  customerPhone: string;
  kycStatus: 'pending' | 'approved' | 'rejected';
  bookingId: string;
  bookingCode: string;
  moveInDate: string;
  monthlyRentPaise: number;
};

export type PgBedMapVacating = {
  requestId: string;
  status: 'pending' | 'approved';
  vacatingDate: string;
};

export type PgBedMapBillingHints = {
  rentOverdueCount: number;
  rentPendingCount: number;
  electricityPendingCount: number;
};

export type PgBedMapBed = {
  bedId: string;
  bedCode: string;
  bedStatus: 'available' | 'maintenance' | 'blocked';
  isOccupiedToday: boolean;
  occupant: PgBedMapOccupant | null;
  vacating: PgBedMapVacating | null;
  billing: PgBedMapBillingHints;
};

export type PgBedMapRoom = {
  roomId: string;
  roomNumber: string;
  roomTypeName: string;
  sharingCount: number;
  hasAc: boolean;
  beds: PgBedMapBed[];
};

export type PgBedMapFloor = {
  floorNumber: number;
  floorLabel: string;
  rooms: PgBedMapRoom[];
};

export type PgBedMapSummary = {
  totalBeds: number;
  occupiedBeds: number;
  vacantBeds: number;
  maintenanceBeds: number;
  blockedBeds: number;
  vacatingSoon: number;
};

export type PgBedMap = {
  pgId: string;
  floors: PgBedMapFloor[];
  summary: PgBedMapSummary;
};

type RawRow = {
  floor_number: number;
  floor_label: string;
  room_id: string;
  room_number: string;
  room_type_name: string;
  sharing_count: number;
  has_ac: boolean;
  bed_id: string;
  bed_code: string;
  bed_status: 'available' | 'maintenance' | 'blocked';
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  kyc_status: 'pending' | 'approved' | 'rejected' | null;
  booking_id: string | null;
  booking_code: string | null;
  move_in_date: string | null;
  monthly_rent_paise: number | null;
  vacating_request_id: string | null;
  vacating_status: 'pending' | 'approved' | null;
  vacating_date: string | null;
  rent_overdue_count: number;
  rent_pending_count: number;
  electricity_pending_count: number;
};

function buildBed(row: RawRow): PgBedMapBed {
  const occupant =
    row.customer_id && row.booking_id && row.booking_code && row.move_in_date
      ? {
          customerId: row.customer_id,
          customerName: row.customer_name ?? 'Resident',
          customerPhone: row.customer_phone ?? '',
          kycStatus: row.kyc_status ?? ('pending' as const),
          bookingId: row.booking_id,
          bookingCode: row.booking_code,
          moveInDate: row.move_in_date,
          monthlyRentPaise: row.monthly_rent_paise ?? 0,
        }
      : null;

  const vacating =
    row.vacating_request_id && row.vacating_status && row.vacating_date
      ? {
          requestId: row.vacating_request_id,
          status: row.vacating_status,
          vacatingDate: row.vacating_date,
        }
      : null;

  return {
    bedId: row.bed_id,
    bedCode: row.bed_code,
    bedStatus: row.bed_status,
    isOccupiedToday: occupant !== null,
    occupant,
    vacating,
    billing: {
      rentOverdueCount: row.rent_overdue_count,
      rentPendingCount: row.rent_pending_count,
      electricityPendingCount: row.electricity_pending_count,
    },
  };
}

/** PG-scoped floor → room → bed map with live occupancy and resident shortcuts. */
export async function getPgBedMap(session: AdminSession, pgId: string): Promise<PgBedMap | null> {
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pgId)) {
    return null;
  }

  const rows = Array.from(
    await db.execute<RawRow>(sql`
    SELECT
      f.floor_number,
      coalesce(f.label, 'Floor ' || f.floor_number) AS floor_label,
      r.id::text AS room_id,
      r.room_number,
      rt.name AS room_type_name,
      rt.default_capacity::int AS sharing_count,
      rt.has_ac,
      b.id::text AS bed_id,
      b.bed_code,
      b.status AS bed_status,
      occ.customer_id::text,
      occ.customer_name,
      occ.customer_phone,
      occ.kyc_status,
      occ.booking_id::text,
      occ.booking_code,
      occ.move_in_date,
      occ.monthly_rent_paise,
      vac.request_id::text AS vacating_request_id,
      vac.status AS vacating_status,
      vac.vacating_date,
      coalesce(bill.rent_overdue, 0)::int AS rent_overdue_count,
      coalesce(bill.rent_pending, 0)::int AS rent_pending_count,
      coalesce(bill.elec_pending, 0)::int AS electricity_pending_count
    FROM beds b
    INNER JOIN rooms r ON r.id = b.room_id AND r.archived_at IS NULL
    INNER JOIN floors f ON f.id = r.floor_id AND f.archived_at IS NULL
    INNER JOIN room_types rt ON rt.id = r.room_type_id
    LEFT JOIN LATERAL (
      SELECT
        c.id AS customer_id,
        c.full_name AS customer_name,
        c.phone AS customer_phone,
        c.kyc_status,
        bk.id AS booking_id,
        bk.booking_code,
        lower(br.stay_range)::text AS move_in_date,
        coalesce((
          SELECT sum((elem->>'monthlyRatePaise')::bigint)::int
          FROM jsonb_array_elements(bk.pricing_snapshot->'perBed') elem
        ), 0) AS monthly_rent_paise
      FROM bed_reservations br
      INNER JOIN bookings bk ON bk.id = br.booking_id
      INNER JOIN customers c ON c.id = bk.customer_id
      WHERE br.bed_id = b.id
        AND br.status = 'active'
        AND br.kind = 'primary'
        AND bk.status = 'confirmed'
        AND bk.duration_mode IN ('monthly', 'open_ended')
        AND CURRENT_DATE <@ br.stay_range
      ORDER BY lower(br.stay_range) DESC
      LIMIT 1
    ) occ ON true
    LEFT JOIN LATERAL (
      SELECT vr.id AS request_id, vr.status, vr.vacating_date::text AS vacating_date
      FROM vacating_requests vr
      WHERE vr.booking_id = occ.booking_id
        AND vr.status IN ('pending', 'approved')
      LIMIT 1
    ) vac ON occ.booking_id IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT
        count(*) FILTER (WHERE ri.status = 'overdue')::int AS rent_overdue,
        count(*) FILTER (WHERE ri.status = 'pending')::int AS rent_pending,
        (
          SELECT count(*)::int FROM electricity_invoices ei
          WHERE ei.booking_id = occ.booking_id
            AND ei.status = 'pending'
        ) AS elec_pending
      FROM rent_invoices ri
      WHERE ri.booking_id = occ.booking_id
    ) bill ON occ.booking_id IS NOT NULL
    WHERE f.pg_id = ${pgId}::uuid
      AND b.archived_at IS NULL
    ORDER BY f.floor_number ASC, r.room_number ASC, b.bed_code ASC
  `),
  );

  const floorMap = new Map<number, { floorLabel: string; rooms: Map<string, PgBedMapRoom> }>();

  for (const row of rows) {
    let floor = floorMap.get(row.floor_number);
    if (!floor) {
      floor = { floorLabel: row.floor_label, rooms: new Map() };
      floorMap.set(row.floor_number, floor);
    }

    let room = floor.rooms.get(row.room_id);
    if (!room) {
      room = {
        roomId: row.room_id,
        roomNumber: row.room_number,
        roomTypeName: row.room_type_name,
        sharingCount: row.sharing_count,
        hasAc: row.has_ac,
        beds: [],
      };
      floor.rooms.set(row.room_id, room);
    }

    room.beds.push(buildBed(row));
  }

  const floors: PgBedMapFloor[] = [...floorMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([floorNumber, floor]) => ({
      floorNumber,
      floorLabel: floor.floorLabel,
      rooms: [...floor.rooms.values()].sort((a, b) =>
        a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }),
      ),
    }));

  const allBeds = floors.flatMap((f) => f.rooms.flatMap((r) => r.beds));
  const summary: PgBedMapSummary = {
    totalBeds: allBeds.length,
    occupiedBeds: allBeds.filter((b) => b.isOccupiedToday).length,
    vacantBeds: allBeds.filter((b) => !b.isOccupiedToday && b.bedStatus === 'available').length,
    maintenanceBeds: allBeds.filter((b) => b.bedStatus === 'maintenance').length,
    blockedBeds: allBeds.filter((b) => b.bedStatus === 'blocked').length,
    vacatingSoon: allBeds.filter((b) => b.vacating).length,
  };

  return { pgId, floors, summary };
}

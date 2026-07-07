import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import type { BedAvailabilityView } from '@/src/lib/bedAvailabilityState';
import { resolveBedOccupancy } from '@/src/lib/bedOccupancyResolve';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { todayString } from '@/src/lib/dates';
import { occupancyReservationCoreSql } from '@/src/lib/occupancySsot';

import type { BedBlockReason } from '@/src/lib/inventoryBlocking';

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
  deductionPaise: number;
  settlementId: string | null;
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
  maintenanceReason: string | null;
  maintenanceReasonCustom: string | null;
  maintenanceStartedAt: string | null;
  maintenanceExpectedCompletion: string | null;
  maintenanceNotes: string | null;
  isOccupiedToday: boolean;
  isAvailableNow: boolean;
  manualOccupied: boolean;
  manualReservedStart: string | null;
  manualReservedCheckIn: string | null;
  bedReserveCheckIn: string | null;
  occupant: PgBedMapOccupant | null;
  reserved: PgBedMapOccupant | null;
  reservedFrom: string | null;
  preBookableFrom: string | null;
  interestCount: number;
  vacating: PgBedMapVacating | null;
  billing: PgBedMapBillingHints;
  availability: BedAvailabilityView;
  blockReason: BedBlockReason;
  underReview: PgBedMapOccupant | null;
  transferHoldRequestId: string | null;
};

export type PgBedMapRoom = {
  roomId: string;
  roomNumber: string;
  roomTypeName: string;
  sharingCount: number;
  hasAc: boolean;
  floorLabel: string;
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
  openNowBeds: number;
  reservedBeds: number;
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
  maintenance_reason: string | null;
  maintenance_reason_custom: string | null;
  maintenance_started_at: string | null;
  maintenance_expected_completion: string | null;
  maintenance_notes: string | null;
  manual_occupied: boolean;
  manual_reserved_start: string | null;
  manual_reserved_check_in: string | null;
  bed_reserve_check_in: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  kyc_status: 'pending' | 'approved' | 'rejected' | null;
  booking_id: string | null;
  booking_code: string | null;
  move_in_date: string | null;
  stay_upper: string | null;
  stay_type: string | null;
  duration_mode: string | null;
  expected_checkout_date: string | null;
  monthly_rent_paise: number | null;
  reserved_customer_id: string | null;
  reserved_customer_name: string | null;
  reserved_customer_phone: string | null;
  reserved_kyc_status: 'pending' | 'approved' | 'rejected' | null;
  reserved_booking_id: string | null;
  reserved_booking_code: string | null;
  reserved_from: string | null;
  reserved_rent_paise: number | null;
  vacating_request_id: string | null;
  vacating_status: 'pending' | 'approved' | null;
  vacating_date: string | null;
  vacating_deduction_paise: number | null;
  vacating_settlement_id: string | null;
  vacating_settlement_suppressed: boolean | null;
  rent_overdue_count: number;
  rent_pending_count: number;
  electricity_pending_count: number;
  interest_count: number;
  notice_interest_count: number;
  review_customer_id: string | null;
  review_customer_name: string | null;
  review_customer_phone: string | null;
  review_kyc_status: 'pending' | 'approved' | 'rejected' | null;
  review_booking_id: string | null;
  review_booking_code: string | null;
  review_move_in: string | null;
  review_rent_paise: number | null;
  transfer_hold_request_id: string | null;
};

function buildOccupant(
  row: RawRow,
  prefix: 'customer' | 'reserved_customer',
  bookingPrefix: 'booking' | 'reserved_booking',
  moveIn: string | null,
  rentField: 'monthly_rent_paise' | 'reserved_rent_paise',
): PgBedMapOccupant | null {
  const customerId =
    prefix === 'customer' ? row.customer_id : row.reserved_customer_id;
  const bookingId = bookingPrefix === 'booking' ? row.booking_id : row.reserved_booking_id;
  const bookingCode =
    bookingPrefix === 'booking' ? row.booking_code : row.reserved_booking_code;
  if (!customerId || !bookingId || !bookingCode || !moveIn) return null;
  const name =
    prefix === 'customer'
      ? row.customer_name ?? 'Resident'
      : row.reserved_customer_name ?? 'Reserved';
  const phone =
    prefix === 'customer' ? row.customer_phone ?? '' : row.reserved_customer_phone ?? '';
  const kyc =
    prefix === 'customer'
      ? row.kyc_status ?? ('pending' as const)
      : row.reserved_kyc_status ?? ('pending' as const);
  return {
    customerId,
    customerName: name,
    customerPhone: phone,
    kycStatus: kyc,
    bookingId,
    bookingCode,
    moveInDate: moveIn,
    monthlyRentPaise: row[rentField] ?? 0,
  };
}

function buildBed(row: RawRow): PgBedMapBed {
  const occupant = buildOccupant(row, 'customer', 'booking', row.move_in_date, 'monthly_rent_paise');
  const reserved = buildOccupant(
    row,
    'reserved_customer',
    'reserved_booking',
    row.reserved_from,
    'reserved_rent_paise',
  );

  const underReview = buildOccupant(
    {
      ...row,
      customer_id: row.review_customer_id,
      customer_name: row.review_customer_name,
      customer_phone: row.review_customer_phone,
      kyc_status: row.review_kyc_status,
      booking_id: row.review_booking_id,
      booking_code: row.review_booking_code,
      monthly_rent_paise: row.review_rent_paise,
    } as RawRow,
    'customer',
    'booking',
    row.review_move_in,
    'monthly_rent_paise',
  );

  const vacating =
    row.vacating_request_id && row.vacating_status && row.vacating_date
      ? {
          requestId: row.vacating_request_id,
          status: row.vacating_status,
          vacatingDate: row.vacating_date,
          deductionPaise: row.vacating_deduction_paise ?? 0,
          settlementId: row.vacating_settlement_id,
        }
      : null;

  const isOccupiedToday = occupant !== null;
  const manualOccupied = Boolean(row.manual_occupied);
  const manualReservedCheckIn =
    row.manual_reserved_check_in && row.manual_reserved_check_in >= todayString()
      ? row.manual_reserved_check_in
      : null;
  const bedReserveCheckIn = row.bed_reserve_check_in;
  const effectiveReserveCheckIn = manualReservedCheckIn ?? bedReserveCheckIn;
  const preBookableFrom =
    vacating?.status === 'approved'
      ? vacating.vacatingDate
      : isOccupiedToday
        ? row.stay_upper
        : null;

  const resolved = resolveBedOccupancy({
    bedId: row.bed_id,
    bedStatus: row.bed_status,
    isOccupiedToday,
    manualOccupied,
    stayType: isOccupiedToday ? row.stay_type : null,
    durationMode: isOccupiedToday ? row.duration_mode : null,
    expectedCheckoutDate: isOccupiedToday ? row.expected_checkout_date : null,
    stayUpper: isOccupiedToday ? row.stay_upper : null,
    vacatingDate: isOccupiedToday ? vacating?.vacatingDate : undefined,
    vacatingStatus: isOccupiedToday ? vacating?.status : undefined,
    manualReservedCheckIn: effectiveReserveCheckIn,
    activeBedReserveCheckIn: bedReserveCheckIn,
    reservedFrom: row.reserved_from,
    occupantFirstName: occupant?.customerName.split(' ')[0],
    interestCount: row.interest_count,
    noticeInterestCount: row.notice_interest_count,
    underReviewRequest: Boolean(underReview),
    underReviewMoveIn: row.review_move_in,
    transferHoldActive: Boolean(row.transfer_hold_request_id),
    maintenanceReason: row.maintenance_reason,
    maintenanceReasonCustom: row.maintenance_reason_custom,
    maintenanceStartedAt: row.maintenance_started_at,
    maintenanceExpectedCompletion: row.maintenance_expected_completion,
    maintenanceNotes: row.maintenance_notes,
  });

  const availability = resolved.adminView;
  const isAvailableNow = resolved.isOpenNow;

  let blockReason: BedBlockReason = 'none';
  if (underReview) blockReason = 'under_review';
  else if (row.transfer_hold_request_id) blockReason = 'transfer_hold';
  else if (reserved) blockReason = 'reserved_incoming';
  else if (occupant) blockReason = 'occupied';
  else if (bedReserveCheckIn) blockReason = 'bed_reserve';
  else if (row.bed_status === 'maintenance') blockReason = 'maintenance';

  return {
    bedId: row.bed_id,
    bedCode: row.bed_code,
    bedStatus: row.bed_status,
    maintenanceReason: row.maintenance_reason,
    maintenanceReasonCustom: row.maintenance_reason_custom,
    maintenanceStartedAt: row.maintenance_started_at,
    maintenanceExpectedCompletion: row.maintenance_expected_completion,
    maintenanceNotes: row.maintenance_notes,
    isOccupiedToday,
    isAvailableNow,
    manualOccupied,
    manualReservedStart: row.manual_reserved_start,
    manualReservedCheckIn,
    bedReserveCheckIn,
    occupant,
    reserved,
    reservedFrom: row.reserved_from,
    preBookableFrom,
    interestCount: row.interest_count,
    vacating,
    billing: {
      rentOverdueCount: row.rent_overdue_count,
      rentPendingCount: row.rent_pending_count,
      electricityPendingCount: row.electricity_pending_count,
    },
    availability,
    blockReason,
    underReview,
    transferHoldRequestId: row.transfer_hold_request_id,
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
      b.maintenance_reason,
      b.maintenance_reason_custom,
      b.maintenance_started_at::text,
      b.maintenance_expected_completion::text,
      b.maintenance_notes,
      b.manual_occupied,
      b.manual_reserved_start::text,
      b.manual_reserved_check_in::text,
      brhold.check_in_date::text AS bed_reserve_check_in,
      occ.customer_id::text,
      occ.customer_name,
      occ.customer_phone,
      occ.kyc_status,
      occ.booking_id::text,
      occ.booking_code,
      occ.move_in_date,
      occ.stay_upper,
      occ.stay_type,
      occ.duration_mode,
      occ.expected_checkout_date,
      occ.monthly_rent_paise,
      res.customer_id::text AS reserved_customer_id,
      res.customer_name AS reserved_customer_name,
      res.customer_phone AS reserved_customer_phone,
      res.kyc_status AS reserved_kyc_status,
      res.booking_id::text AS reserved_booking_id,
      res.booking_code AS reserved_booking_code,
      res.reserved_from,
      res.monthly_rent_paise AS reserved_rent_paise,
      vac.request_id::text AS vacating_request_id,
      vac.status AS vacating_status,
      vac.vacating_date,
      vac.deduction_paise AS vacating_deduction_paise,
      vac.settlement_id AS vacating_settlement_id,
      vac.checkout_settlement_suppressed AS vacating_settlement_suppressed,
      coalesce(bill.rent_overdue, 0)::int AS rent_overdue_count,
      coalesce(bill.rent_pending, 0)::int AS rent_pending_count,
      coalesce(bill.elec_pending, 0)::int AS electricity_pending_count,
      coalesce(hold.interest_count, 0)::int AS interest_count,
      coalesce(notice_i.notice_interest_count, 0)::int AS notice_interest_count,
      review_req.review_customer_id::text,
      review_req.review_customer_name,
      review_req.review_customer_phone,
      review_req.review_kyc_status,
      review_req.review_booking_id::text,
      review_req.review_booking_code,
      review_req.review_move_in,
      review_req.review_rent_paise,
      xfer.transfer_hold_request_id
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
        upper(br.stay_range)::text AS stay_upper,
        bk.stay_type::text AS stay_type,
        bk.duration_mode::text AS duration_mode,
        bk.expected_checkout_date::text AS expected_checkout_date,
        coalesce((
          SELECT bp.monthly_rate_paise::int
          FROM bed_prices bp
          WHERE bp.bed_id = b.id
            AND bp.effective_from <= CURRENT_DATE
            AND (bp.effective_to IS NULL OR bp.effective_to > CURRENT_DATE)
          ORDER BY bp.effective_from DESC, bp.created_at DESC
          LIMIT 1
        ), (
          SELECT sum((elem->>'monthlyRatePaise')::bigint)::int
          FROM jsonb_array_elements(bk.pricing_snapshot->'perBed') elem
        ), 0) AS monthly_rent_paise
      FROM bed_reservations br
      INNER JOIN bookings bk ON bk.id = br.booking_id
      INNER JOIN customers c ON c.id = bk.customer_id
      WHERE br.bed_id = b.id
        AND ${occupancyReservationCoreSql}
      ORDER BY lower(br.stay_range) DESC
      LIMIT 1
    ) occ ON true
    LEFT JOIN LATERAL (
      SELECT
        c.id AS customer_id,
        c.full_name AS customer_name,
        c.phone AS customer_phone,
        c.kyc_status,
        bk.id AS booking_id,
        bk.booking_code,
        lower(br.stay_range)::text AS reserved_from,
        coalesce((
          SELECT bp.monthly_rate_paise::int
          FROM bed_prices bp
          WHERE bp.bed_id = b.id
            AND bp.effective_from <= CURRENT_DATE
            AND (bp.effective_to IS NULL OR bp.effective_to > CURRENT_DATE)
          ORDER BY bp.effective_from DESC, bp.created_at DESC
          LIMIT 1
        ), (
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
        AND lower(br.stay_range) > CURRENT_DATE
      ORDER BY lower(br.stay_range) ASC
      LIMIT 1
    ) res ON true
    LEFT JOIN LATERAL (
      SELECT brh.check_in_date
      FROM bed_reserve_holds brh
      WHERE brh.bed_id = b.id
        AND (
          brh.status::text IN ('under_review', 'active')
          OR (
            brh.status::text = 'pending_payment'
            AND brh.payment_proof_url IS NOT NULL
            AND trim(brh.payment_proof_url) <> ''
          )
        )
        AND brh.check_in_date >= CURRENT_DATE
      ORDER BY brh.created_at DESC
      LIMIT 1
    ) brhold ON true
    LEFT JOIN LATERAL (
      SELECT vr.id AS request_id, vr.status, vr.vacating_date::text AS vacating_date, vr.deduction_paise,
        vr.checkout_settlement_suppressed,
        (
          SELECT cs.id::text FROM checkout_settlements cs
          WHERE cs.vacating_request_id = vr.id
            AND cs.status NOT IN ('archived', 'completed')
          ORDER BY cs.created_at DESC
          LIMIT 1
        ) AS settlement_id
      FROM vacating_requests vr
      WHERE vr.booking_id = coalesce(occ.booking_id, res.booking_id)
        AND vr.status IN ('pending', 'approved')
      LIMIT 1
    ) vac ON coalesce(occ.booking_id, res.booking_id) IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT
        count(*) FILTER (WHERE ri.status = 'overdue')::int AS rent_overdue,
        count(*) FILTER (WHERE ri.status = 'pending')::int AS rent_pending,
        (
          SELECT count(*)::int FROM electricity_invoices ei
          WHERE ei.booking_id = coalesce(occ.booking_id, res.booking_id)
            AND ei.status = 'pending'
        ) AS elec_pending
      FROM rent_invoices ri
      WHERE ri.booking_id = coalesce(occ.booking_id, res.booking_id)
    ) bill ON coalesce(occ.booking_id, res.booking_id) IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT count(distinct bk.id)::int AS interest_count
      FROM bed_reservations br
      INNER JOIN bookings bk ON bk.id = br.booking_id
      WHERE br.bed_id = b.id
        AND br.status = 'hold'
        AND bk.status = 'pending_payment'
        AND (br.hold_expires_at IS NULL OR br.hold_expires_at > now())
        AND CURRENT_DATE <@ br.stay_range
    ) hold ON true
    LEFT JOIN LATERAL (
      SELECT
        c.id AS review_customer_id,
        c.full_name AS review_customer_name,
        c.phone AS review_customer_phone,
        c.kyc_status AS review_kyc_status,
        bk.id AS review_booking_id,
        bk.booking_code AS review_booking_code,
        lower(br.stay_range)::text AS review_move_in,
        coalesce((
          SELECT bp.monthly_rate_paise::int
          FROM bed_prices bp
          WHERE bp.bed_id = b.id
            AND bp.effective_from <= CURRENT_DATE
            AND (bp.effective_to IS NULL OR bp.effective_to > CURRENT_DATE)
          ORDER BY bp.effective_from DESC, bp.created_at DESC
          LIMIT 1
        ), (
          SELECT sum((elem->>'monthlyRatePaise')::bigint)::int
          FROM jsonb_array_elements(bk.pricing_snapshot->'perBed') elem
        ), 0) AS review_rent_paise
      FROM bed_reservations br
      INNER JOIN bookings bk ON bk.id = br.booking_id
      INNER JOIN customers c ON c.id = bk.customer_id
      WHERE br.bed_id = b.id
        AND br.status::text = 'under_review'
        AND br.kind = 'primary'
        AND bk.status = 'pending_approval'
      ORDER BY br.created_at DESC
      LIMIT 1
    ) review_req ON true
    LEFT JOIN LATERAL (
      SELECT rcr.id::text AS transfer_hold_request_id
      FROM room_transfer_bed_holds rth
      INNER JOIN room_change_requests rcr ON rcr.id = rth.room_change_request_id
      WHERE rth.bed_id = b.id
        AND rth.status = 'active'
      LIMIT 1
    ) xfer ON true
    LEFT JOIN LATERAL (
      SELECT count(distinct bni.visitor_key)::int AS notice_interest_count
      FROM bed_notice_interest bni
      WHERE bni.bed_id = b.id
    ) notice_i ON true
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
        floorLabel: row.floor_label,
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

  const { fetchBedOccupancyRows, resolveBedOccupancyRows } = await import(
    '@/src/services/bedOccupancyBatch'
  );
  const { aggregateOccupancyCounts } = await import('@/src/lib/bedOccupancyResolve');
  const occupancyAgg = aggregateOccupancyCounts(
    resolveBedOccupancyRows(await fetchBedOccupancyRows({ pgId })),
  );

  const summary: PgBedMapSummary = {
    totalBeds: occupancyAgg.totalBeds,
    occupiedBeds: occupancyAgg.occupiedBeds,
    openNowBeds: occupancyAgg.openNowBeds,
    reservedBeds: occupancyAgg.reservedBeds,
    maintenanceBeds: occupancyAgg.maintenanceBeds,
    blockedBeds: occupancyAgg.blockedBeds,
    vacatingSoon: occupancyAgg.vacatingSoon,
  };

  return { pgId, floors, summary };
}

/**
 * Customer-facing read queries.
 *
 * Mirror the shape of `src/db/queries/admin.ts`: every function returns a
 * `QueryResult<T>` discriminated union so page components can render a
 * "database unreachable" state instead of crashing.
 *
 * These are read-only. Mutations live in `src/services/booking.ts`.
 */

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../client';
import {
  beds,
  bedPrices,
  bedReservations,
  bedReserveHolds,
  bookings,
  customers,
  electricityBills,
  electricityInvoices,
  floors,
  payments,
  pgs,
  rentInvoices,
  rooms,
  roomTypes,
  stayExtensions,
  vacatingRequests,
} from '../schema';
import type { PricingSnapshot } from '../schema/bookings';
import { classifyDatabaseError } from '@/src/lib/db/connectionOptions';
import { getDatabaseHost, getDatabaseUrlSource } from '@/src/lib/db/env';
import { todayString } from '@/src/lib/dates';
import { logger } from '@/src/lib/logger';
import { safeQuery } from '@/src/lib/healing/safeQuery';
import { traceQuery } from '@/src/lib/monitoring/traceQuery';
import { maybeRunRecoveryCheck } from '@/src/lib/healing/healthEngine';

export type QueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; errorCode?: string };

async function guard<T>(
  fn: () => Promise<T>,
  queryName = 'customerQuery',
  fallback?: T,
): Promise<QueryResult<T>> {
  await maybeRunRecoveryCheck();

  const result = await safeQuery(
    queryName,
    () => traceQuery(queryName, fn),
    (fallback ?? (null as unknown as T)),
  );

  if (result.degraded) {
    const message = result.error ?? 'Database temporarily unavailable';
    const classified = classifyDatabaseError(message);
    logger.error('customer query degraded', {
      queryName,
      dbSource: getDatabaseUrlSource(),
      dbHost: getDatabaseHost(),
      message,
      ...classified,
    });
    if (fallback !== undefined) {
      return { ok: true, data: fallback };
    }
    return { ok: false, error: message, errorCode: classified.code };
  }

  return { ok: true, data: result.data };
}

// ───────────────────────────────────────────────────────────────────────────
// PG list (customer-facing)
// ───────────────────────────────────────────────────────────────────────────

export type CustomerPgListRow = {
  id: string;
  slug: string;
  name: string;
  city: string;
  state: string;
  pincode: string;
  genderPolicy: 'male' | 'female' | 'coed';
  amenities: Record<string, unknown>;
  description: string | null;
  heroImage: string | null;
  totalBeds: number;
  availableBeds: number;
  startingFromPaise: number;
  hasPaymentEnabled: boolean;
};

/**
 * Public PG list. "Available beds" is computed against today only — the
 * customer can refine by date once they click into a PG.
 */
export function listPublicPgs(): Promise<QueryResult<CustomerPgListRow[]>> {
  return guard(async () => {
    const rows = await db
      .select({
        id: pgs.id,
        slug: pgs.slug,
        name: pgs.name,
        city: pgs.city,
        state: pgs.state,
        pincode: pgs.pincode,
        genderPolicy: pgs.genderPolicy,
        amenities: pgs.amenities,
        description: pgs.description,
        images: pgs.images,
        hasPaymentEnabled: pgs.hasPaymentEnabled,
        // NOTE: All correlated references to the outer table must be written
        // as qualified literals (e.g. `pgs.id`, not `${pgs.id}`). Drizzle's
        // `sql` template renders `${pgs.id}` as the bare column name `"id"`,
        // which becomes ambiguous inside a subquery whose own FROM also has
        // an `id` column. Postgres then raises 42702 ("column reference 'id'
        // is ambiguous") or, worse, silently binds to the wrong column.
        totalBeds: sql<number>`(
          SELECT count(*)::int FROM ${beds} b
          JOIN ${rooms} r ON r.id = b.room_id
          JOIN ${floors} f ON f.id = r.floor_id
          WHERE f.pg_id = pgs.id
            AND b.archived_at IS NULL
            AND r.archived_at IS NULL
            AND f.archived_at IS NULL
        )`,
        availableBeds: sql<number>`(
          SELECT count(*)::int FROM ${beds} b
          JOIN ${rooms} r ON r.id = b.room_id
          JOIN ${floors} f ON f.id = r.floor_id
          WHERE f.pg_id = pgs.id
            AND b.archived_at IS NULL
            AND r.archived_at IS NULL
            AND f.archived_at IS NULL
            AND b.status = 'available'
            AND NOT b.manual_occupied
            AND NOT EXISTS (
              SELECT 1 FROM ${bedReservations} br
              WHERE br.bed_id = b.id
                AND br.status = 'active'
                AND CURRENT_DATE <@ br.stay_range
            )
        )`,
        startingFromPaise: sql<number>`coalesce((
          SELECT min(bp.monthly_rate_paise)::bigint::int FROM ${bedPrices} bp
          JOIN ${beds} b ON b.id = bp.bed_id
          JOIN ${rooms} r ON r.id = b.room_id
          JOIN ${floors} f ON f.id = r.floor_id
          WHERE f.pg_id = pgs.id
            AND b.archived_at IS NULL
            AND (bp.effective_to IS NULL OR bp.effective_to > CURRENT_DATE)
            AND bp.effective_from <= CURRENT_DATE
        ), 0)`,
      })
      .from(pgs)
      .where(and(sql`${pgs.archivedAt} IS NULL`, eq(pgs.isActive, true)))
      .orderBy(asc(pgs.name));

    const result = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      city: r.city,
      state: r.state,
      pincode: r.pincode,
      genderPolicy: r.genderPolicy,
      amenities: (r.amenities ?? {}) as Record<string, unknown>,
      description: r.description,
      heroImage: Array.isArray(r.images) && r.images.length > 0 ? r.images[0] : null,
      totalBeds: r.totalBeds,
      availableBeds: r.availableBeds,
      startingFromPaise: r.startingFromPaise,
      hasPaymentEnabled: r.hasPaymentEnabled,
    }));

    const sourceUsed = getDatabaseUrlSource();
    logger.db('listPublicPgs', {
      host: getDatabaseHost(),
      source: sourceUsed,
      count: result.length,
    });

    return result;
  }, 'listPublicPgs', []);
}

// ───────────────────────────────────────────────────────────────────────────
// PG detail
// ───────────────────────────────────────────────────────────────────────────

export type CustomerPgDetail = {
  id: string;
  slug: string;
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  pincode: string;
  genderPolicy: 'male' | 'female' | 'coed';
  amenities: Record<string, unknown>;
  description: string | null;
  images: string[];
};

export function getPgBySlug(
  slug: string,
): Promise<QueryResult<CustomerPgDetail | null>> {
  return guard(async () => {
    const [row] = await db
      .select({
        id: pgs.id,
        slug: pgs.slug,
        name: pgs.name,
        addressLine1: pgs.addressLine1,
        addressLine2: pgs.addressLine2,
        city: pgs.city,
        state: pgs.state,
        pincode: pgs.pincode,
        genderPolicy: pgs.genderPolicy,
        amenities: pgs.amenities,
        description: pgs.description,
        images: pgs.images,
      })
      .from(pgs)
      .where(and(eq(pgs.slug, slug), sql`${pgs.archivedAt} IS NULL`))
      .limit(1);
    if (!row) return null;
    return {
      ...row,
      amenities: (row.amenities ?? {}) as Record<string, unknown>,
      images: Array.isArray(row.images) ? (row.images as string[]) : [],
    };
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Rooms for a PG (with per-room availability over [start, end))
// ───────────────────────────────────────────────────────────────────────────

export type CustomerRoomCard = {
  roomId: string;
  roomNumber: string;
  roomType: string;
  capacity: number;
  hasAc: boolean;
  hasAttachedBath: boolean;
  floorNumber: number;
  floorLabel: string;
  totalBeds: number;
  availableBeds: number;
  monthlyRatePaise: number;
  dailyRatePaise: number;
  weeklyRatePaise: number;
};

export function listRoomsForPg(
  pgId: string,
  referenceDate?: string,
): Promise<QueryResult<CustomerRoomCard[]>> {
  return guard(async () => {
    const refDate = referenceDate ?? todayString();
    const rows = await db
      .select({
        roomId: rooms.id,
        roomNumber: rooms.roomNumber,
        roomType: roomTypes.name,
        capacity: roomTypes.defaultCapacity,
        hasAc: roomTypes.hasAc,
        hasAttachedBath: roomTypes.hasAttachedBath,
        floorNumber: floors.floorNumber,
        floorLabel: sql<string>`coalesce(${floors.label}, 'Floor ' || ${floors.floorNumber})`,
        // Correlated references to the outer `rooms.id` are written as the
        // qualified literal `rooms.id` (see notes in listPublicPgs above).
        totalBeds: sql<number>`(
          SELECT count(*)::int FROM ${beds} b
          WHERE b.room_id = rooms.id AND b.archived_at IS NULL
        )`,
        availableBeds: sql<number>`(
          SELECT count(*)::int FROM ${beds} b
          WHERE b.room_id = rooms.id
            AND b.archived_at IS NULL
            AND b.status = 'available'
            AND NOT b.manual_occupied
            AND NOT EXISTS (
              SELECT 1 FROM ${bedReservations} br
              WHERE br.bed_id = b.id
                AND br.status = 'active'
                AND ${refDate}::date <@ br.stay_range
            )
        )`,
        monthlyRatePaise: sql<number>`coalesce((
          SELECT min(bp.monthly_rate_paise)::bigint::int FROM ${bedPrices} bp
          JOIN ${beds} b ON b.id = bp.bed_id
          WHERE b.room_id = rooms.id
            AND b.archived_at IS NULL
            AND bp.effective_from <= ${refDate}::date
            AND (bp.effective_to IS NULL OR bp.effective_to > ${refDate}::date)
        ), 0)`,
        dailyRatePaise: sql<number>`coalesce((
          SELECT min(bp.daily_rate_paise)::bigint::int FROM ${bedPrices} bp
          JOIN ${beds} b ON b.id = bp.bed_id
          WHERE b.room_id = rooms.id
            AND b.archived_at IS NULL
            AND bp.effective_from <= ${refDate}::date
            AND (bp.effective_to IS NULL OR bp.effective_to > ${refDate}::date)
        ), 0)`,
        weeklyRatePaise: sql<number>`coalesce((
          SELECT min(bp.weekly_rate_paise)::bigint::int FROM ${bedPrices} bp
          JOIN ${beds} b ON b.id = bp.bed_id
          WHERE b.room_id = rooms.id
            AND b.archived_at IS NULL
            AND bp.effective_from <= ${refDate}::date
            AND (bp.effective_to IS NULL OR bp.effective_to > ${refDate}::date)
        ), 0)`,
      })
      .from(rooms)
      .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
      .innerJoin(floors, eq(floors.id, rooms.floorId))
      .where(
        and(
          eq(floors.pgId, pgId),
          sql`${rooms.archivedAt} IS NULL`,
          sql`${floors.archivedAt} IS NULL`,
        ),
      )
      .orderBy(asc(floors.floorNumber), asc(rooms.roomNumber));
    return rows;
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Single-room bed map (for the per-room availability page)
// ───────────────────────────────────────────────────────────────────────────

export type CustomerRoomDetail = {
  roomId: string;
  roomNumber: string;
  roomType: string;
  capacity: number;
  hasAc: boolean;
  hasAttachedBath: boolean;
  floorNumber: number;
  floorLabel: string;
  pgId: string;
  pgSlug: string;
  pgName: string;
  beds: Array<{
    bedId: string;
    bedCode: string;
    status: 'available' | 'maintenance' | 'blocked';
    isAvailableNow: boolean;
    nextAvailableDate: string | null;
    /** Approved/pending vacating date for the current occupant. */
    vacatingDate?: string | null;
    vacatingStatus?: 'pending' | 'approved' | null;
    /** Future reservation — move-in after reference date. */
    reservedFrom?: string | null;
    /** Active 50% reserve hold — holder check-in date. */
    activeBedReserveCheckIn?: string | null;
    /** Admin marked occupied — shown as Occupied on customer website. */
    manualOccupied?: boolean;
    /** Unpaid checkouts in progress — shown as interest, not occupancy. */
    interestCount: number;
    /** Distinct visitors who tapped this bed during notice period. */
    noticeInterestCount: number;
    dailyRatePaise: number;
    weeklyRatePaise: number;
    monthlyRatePaise: number;
    securityDepositPaise: number;
    dailySecurityDepositPaise: number;
    weeklySecurityDepositPaise: number;
    monthlySecurityDepositPaise: number;
  }>;
};

export function getRoomDetail(
  pgSlug: string,
  roomId: string,
  referenceDate?: string,
): Promise<QueryResult<CustomerRoomDetail | null>> {
  return guard(async () => {
    const refDate = referenceDate ?? todayString();
    const [meta] = await db
      .select({
        roomId: rooms.id,
        roomNumber: rooms.roomNumber,
        roomType: roomTypes.name,
        capacity: roomTypes.defaultCapacity,
        hasAc: roomTypes.hasAc,
        hasAttachedBath: roomTypes.hasAttachedBath,
        floorNumber: floors.floorNumber,
        floorLabel: sql<string>`coalesce(${floors.label}, 'Floor ' || ${floors.floorNumber})`,
        pgId: pgs.id,
        pgSlug: pgs.slug,
        pgName: pgs.name,
      })
      .from(rooms)
      .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
      .innerJoin(floors, eq(floors.id, rooms.floorId))
      .innerJoin(pgs, eq(pgs.id, floors.pgId))
      .where(
        and(
          eq(rooms.id, roomId),
          eq(pgs.slug, pgSlug),
          sql`${rooms.archivedAt} IS NULL`,
          sql`${pgs.archivedAt} IS NULL`,
        ),
      )
      .limit(1);

    if (!meta) return null;

    const bedRows = await db
      .select({
        bedId: beds.id,
        bedCode: beds.bedCode,
        status: beds.status,
        manualOccupied: beds.manualOccupied,
        // Correlated references to the outer `beds.id` / `beds.status` are
        // qualified literals to avoid the ambiguity bug — see the note in
        // listPublicPgs above.
        isAvailableNow: sql<boolean>`(
          beds.status = 'available'
          AND NOT beds.manual_occupied
          AND NOT EXISTS (
            SELECT 1 FROM ${bedReservations} br
            WHERE br.bed_id = beds.id
              AND br.status = 'active'
              AND ${refDate}::date <@ br.stay_range
          )
        )`,
        nextAvailableDate: sql<string | null>`(
          SELECT to_char(sub.d, 'YYYY-MM-DD')
          FROM (
            SELECT max(upper(br.stay_range)) AS d
            FROM ${bedReservations} br
            WHERE br.bed_id = beds.id
              AND br.status = 'active'
              AND lower(br.stay_range) <= ${refDate}::date
              AND upper(br.stay_range) > ${refDate}::date
          ) sub
          WHERE sub.d IS NOT NULL AND sub.d < '2090-01-01'::date
        )`,
        interestCount: sql<number>`coalesce((
          SELECT count(distinct bk.id)::int
          FROM ${bedReservations} br
          INNER JOIN ${bookings} bk ON bk.id = br.booking_id
          WHERE br.bed_id = beds.id
            AND br.status = 'hold'
            AND bk.status = 'pending_payment'
            AND (br.hold_expires_at IS NULL OR br.hold_expires_at > now())
            AND ${refDate}::date <@ br.stay_range
        ), 0)`,
        noticeInterestCount: sql<number>`coalesce((
          SELECT count(distinct bni.visitor_key)::int
          FROM bed_notice_interest bni
          WHERE bni.bed_id = beds.id
        ), 0)`,
        vacatingDate: sql<string | null>`(
          SELECT vr.vacating_date::text
          FROM ${bedReservations} br
          INNER JOIN ${bookings} bk ON bk.id = br.booking_id
          INNER JOIN ${vacatingRequests} vr ON vr.booking_id = bk.id
          WHERE br.bed_id = beds.id
            AND br.status = 'active'
            AND ${refDate}::date <@ br.stay_range
            AND vr.status IN ('pending', 'approved')
          LIMIT 1
        )`,
        vacatingStatus: sql<'pending' | 'approved' | null>`(
          SELECT vr.status
          FROM ${bedReservations} br
          INNER JOIN ${bookings} bk ON bk.id = br.booking_id
          INNER JOIN ${vacatingRequests} vr ON vr.booking_id = bk.id
          WHERE br.bed_id = beds.id
            AND br.status = 'active'
            AND ${refDate}::date <@ br.stay_range
            AND vr.status IN ('pending', 'approved')
          LIMIT 1
        )`,
        reservedFrom: sql<string | null>`(
          SELECT lower(br.stay_range)::text
          FROM ${bedReservations} br
          INNER JOIN ${bookings} bk ON bk.id = br.booking_id
          WHERE br.bed_id = beds.id
            AND br.status = 'active'
            AND bk.status = 'confirmed'
            AND lower(br.stay_range) > ${refDate}::date
          LIMIT 1
        )`,
        activeBedReserveCheckIn: sql<string | null>`(
          coalesce(
            (
              SELECT brh.check_in_date::text
              FROM ${bedReserveHolds} brh
              WHERE brh.bed_id = beds.id
                AND brh.status = 'active'
                AND brh.reserve_start <= ${refDate}::date
                AND brh.check_in_date >= ${refDate}::date
              LIMIT 1
            ),
            CASE
              WHEN beds.manual_reserved_check_in IS NOT NULL
                AND beds.manual_reserved_start <= ${refDate}::date
                AND beds.manual_reserved_check_in >= ${refDate}::date
              THEN beds.manual_reserved_check_in::text
              ELSE NULL
            END
          )
        )`,
        dailyRatePaise: sql<number>`coalesce((
          SELECT bp.daily_rate_paise::bigint::int FROM ${bedPrices} bp
          WHERE bp.bed_id = beds.id
            AND bp.effective_from <= ${refDate}::date
            AND (bp.effective_to IS NULL OR bp.effective_to > ${refDate}::date)
          ORDER BY bp.effective_from DESC LIMIT 1
        ), 0)`,
        weeklyRatePaise: sql<number>`coalesce((
          SELECT bp.weekly_rate_paise::bigint::int FROM ${bedPrices} bp
          WHERE bp.bed_id = beds.id
            AND bp.effective_from <= ${refDate}::date
            AND (bp.effective_to IS NULL OR bp.effective_to > ${refDate}::date)
          ORDER BY bp.effective_from DESC LIMIT 1
        ), 0)`,
        monthlyRatePaise: sql<number>`coalesce((
          SELECT bp.monthly_rate_paise::bigint::int FROM ${bedPrices} bp
          WHERE bp.bed_id = beds.id
            AND bp.effective_from <= ${refDate}::date
            AND (bp.effective_to IS NULL OR bp.effective_to > ${refDate}::date)
          ORDER BY bp.effective_from DESC LIMIT 1
        ), 0)`,
        securityDepositPaise: sql<number>`coalesce((
          SELECT bp.security_deposit_paise::bigint::int FROM ${bedPrices} bp
          WHERE bp.bed_id = beds.id
            AND bp.effective_from <= ${refDate}::date
            AND (bp.effective_to IS NULL OR bp.effective_to > ${refDate}::date)
          ORDER BY bp.effective_from DESC LIMIT 1
        ), 0)`,
        dailySecurityDepositPaise: sql<number>`coalesce((
          SELECT bp.daily_security_deposit_paise::bigint::int FROM ${bedPrices} bp
          WHERE bp.bed_id = beds.id
            AND bp.effective_from <= ${refDate}::date
            AND (bp.effective_to IS NULL OR bp.effective_to > ${refDate}::date)
          ORDER BY bp.effective_from DESC LIMIT 1
        ), 0)`,
        weeklySecurityDepositPaise: sql<number>`coalesce((
          SELECT bp.weekly_security_deposit_paise::bigint::int FROM ${bedPrices} bp
          WHERE bp.bed_id = beds.id
            AND bp.effective_from <= ${refDate}::date
            AND (bp.effective_to IS NULL OR bp.effective_to > ${refDate}::date)
          ORDER BY bp.effective_from DESC LIMIT 1
        ), 0)`,
        monthlySecurityDepositPaise: sql<number>`coalesce((
          SELECT bp.monthly_security_deposit_paise::bigint::int FROM ${bedPrices} bp
          WHERE bp.bed_id = beds.id
            AND bp.effective_from <= ${refDate}::date
            AND (bp.effective_to IS NULL OR bp.effective_to > ${refDate}::date)
          ORDER BY bp.effective_from DESC LIMIT 1
        ), 0)`,
      })
      .from(beds)
      .where(and(eq(beds.roomId, meta.roomId), sql`${beds.archivedAt} IS NULL`))
      .orderBy(asc(beds.bedCode));

    return {
      ...meta,
      beds: bedRows,
    };
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Lookup beds by ids (used by /booking/new to render the cart)
// ───────────────────────────────────────────────────────────────────────────

export type CartBedRow = {
  bedId: string;
  bedCode: string;
  roomId: string;
  roomNumber: string;
  roomType: string;
  floorLabel: string;
  pgId: string;
  pgSlug: string;
  pgName: string;
  genderPolicy: 'male' | 'female' | 'coed';
};

export function getBedsForCart(
  bedIds: string[],
): Promise<QueryResult<CartBedRow[]>> {
  return guard(async () => {
    if (bedIds.length === 0) return [];
    // Postgres doesn't like an empty ANY array, so we guard above. UUIDs
    // are validated by the caller via Zod before reaching this query.
    const placeholder = sql.raw(`'{${bedIds.join(',')}}'::uuid[]`);
    const rows = await db
      .select({
        bedId: beds.id,
        bedCode: beds.bedCode,
        roomId: rooms.id,
        roomNumber: rooms.roomNumber,
        roomType: roomTypes.name,
        floorLabel: sql<string>`coalesce(${floors.label}, 'Floor ' || ${floors.floorNumber})`,
        pgId: pgs.id,
        pgSlug: pgs.slug,
        pgName: pgs.name,
        genderPolicy: pgs.genderPolicy,
      })
      .from(beds)
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
      .innerJoin(floors, eq(floors.id, rooms.floorId))
      .innerJoin(pgs, eq(pgs.id, floors.pgId))
      .where(
        and(
          sql`${beds.id} = ANY(${placeholder})`,
          sql`${beds.archivedAt} IS NULL`,
        ),
      )
      .orderBy(asc(floors.floorNumber), asc(rooms.roomNumber), asc(beds.bedCode));
    return rows;
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Booking confirmation read
// ───────────────────────────────────────────────────────────────────────────

export type CustomerBookingDetail = {
  id: string;
  bookingCode: string;
  status: string;
  durationMode: string;
  expectedCheckoutDate: string | null;
  subtotalPaise: number;
  depositPaise: number;
  totalPaise: number;
  pricingSnapshot: PricingSnapshot | null;
  notes: string | null;
  createdAt: Date;
  /** Set when durationMode is `reserve`. */
  reserveStart?: string | null;
  reserveCheckIn?: string | null;
  customer: {
    fullName: string;
    email: string;
    phone: string;
  };
  pg: {
    id: string;
    name: string;
    slug: string;
    addressLine1: string;
    city: string;
    state: string;
    pincode: string;
  };
  reservations: Array<{
    id: string;
    bedCode: string;
    roomNumber: string;
    floorLabel: string;
    stayRange: string;
    status: string;
  }>;
};

export function getBookingByCode(
  bookingCode: string,
): Promise<QueryResult<CustomerBookingDetail | null>> {
  return guard(async () => {
    const [b] = await db
      .select({
        id: bookings.id,
        bookingCode: bookings.bookingCode,
        status: bookings.status,
        durationMode: bookings.durationMode,
        expectedCheckoutDate: bookings.expectedCheckoutDate,
        subtotalPaise: bookings.subtotalPaise,
        depositPaise: bookings.depositPaise,
        totalPaise: bookings.totalPaise,
        pricingSnapshot: bookings.pricingSnapshot,
        notes: bookings.notes,
        createdAt: bookings.createdAt,
        customerFullName: customers.fullName,
        customerEmail: customers.email,
        customerPhone: customers.phone,
      })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .where(eq(bookings.bookingCode, bookingCode))
      .limit(1);

    if (!b) return null;

    const reservationRows = await db
      .select({
        id: bedReservations.id,
        bedCode: beds.bedCode,
        roomNumber: rooms.roomNumber,
        floorLabel: sql<string>`coalesce(${floors.label}, 'Floor ' || ${floors.floorNumber})`,
        stayRange: bedReservations.stayRange,
        status: bedReservations.status,
        pgName: pgs.name,
        pgId: pgs.id,
        pgSlug: pgs.slug,
        pgAddressLine1: pgs.addressLine1,
        pgCity: pgs.city,
        pgState: pgs.state,
        pgPincode: pgs.pincode,
      })
      .from(bedReservations)
      .innerJoin(beds, eq(beds.id, bedReservations.bedId))
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .innerJoin(floors, eq(floors.id, rooms.floorId))
      .innerJoin(pgs, eq(pgs.id, floors.pgId))
      .where(eq(bedReservations.bookingId, b.id))
      .orderBy(asc(beds.bedCode));

    const first = reservationRows[0];

    let pg = first
      ? {
          id: first.pgId,
          name: first.pgName,
          slug: first.pgSlug,
          addressLine1: first.pgAddressLine1,
          city: first.pgCity,
          state: first.pgState,
          pincode: first.pgPincode,
        }
      : {
          id: '',
          name: '—',
          slug: '',
          addressLine1: '',
          city: '',
          state: '',
          pincode: '',
        };

    let reservations = reservationRows.map((r) => ({
      id: r.id,
      bedCode: r.bedCode,
      roomNumber: r.roomNumber,
      floorLabel: r.floorLabel,
      stayRange: r.stayRange as unknown as string,
      status: r.status,
    }));

    let reserveStart: string | null = null;
    let reserveCheckIn: string | null = null;

    if (b.durationMode === 'reserve' && reservationRows.length === 0) {
      const [hold] = await db
        .select({
          reserveStart: bedReserveHolds.reserveStart,
          checkInDate: bedReserveHolds.checkInDate,
          bedCode: beds.bedCode,
          roomNumber: rooms.roomNumber,
          floorLabel: sql<string>`coalesce(${floors.label}, 'Floor ' || ${floors.floorNumber})`,
          pgName: pgs.name,
          pgId: pgs.id,
          pgSlug: pgs.slug,
          pgAddressLine1: pgs.addressLine1,
          pgCity: pgs.city,
          pgState: pgs.state,
          pgPincode: pgs.pincode,
        })
        .from(bedReserveHolds)
        .innerJoin(beds, eq(beds.id, bedReserveHolds.bedId))
        .innerJoin(rooms, eq(rooms.id, beds.roomId))
        .innerJoin(floors, eq(floors.id, rooms.floorId))
        .innerJoin(pgs, eq(pgs.id, floors.pgId))
        .where(eq(bedReserveHolds.bookingId, b.id))
        .limit(1);

      if (hold) {
        reserveStart = String(hold.reserveStart);
        reserveCheckIn = String(hold.checkInDate);
        pg = {
          id: hold.pgId,
          name: hold.pgName,
          slug: hold.pgSlug,
          addressLine1: hold.pgAddressLine1,
          city: hold.pgCity,
          state: hold.pgState,
          pincode: hold.pgPincode,
        };
        reservations = [
          {
            id: b.id,
            bedCode: hold.bedCode,
            roomNumber: hold.roomNumber,
            floorLabel: hold.floorLabel,
            stayRange: `[${reserveStart},${reserveCheckIn})`,
            status: 'active',
          },
        ];
      }
    }

    return {
      id: b.id,
      bookingCode: b.bookingCode,
      status: b.status,
      durationMode: b.durationMode,
      expectedCheckoutDate: b.expectedCheckoutDate,
      subtotalPaise: b.subtotalPaise,
      depositPaise: b.depositPaise,
      totalPaise: b.totalPaise,
      pricingSnapshot: (b.pricingSnapshot as PricingSnapshot | null) ?? null,
      notes: b.notes,
      createdAt: b.createdAt,
      reserveStart,
      reserveCheckIn,
      customer: {
        fullName: b.customerFullName,
        email: b.customerEmail,
        phone: b.customerPhone,
      },
      pg,
      reservations,
    };
  });
}

// ───────────────────────────────────────────────────────────────────────────
// My Bookings — phone-based lookup (no persistent session, pre-Auth.js)
// ───────────────────────────────────────────────────────────────────────────

export type MyBookingRow = {
  id: string;
  bookingCode: string;
  status: string;
  durationMode: string;
  expectedCheckoutDate: string | null;
  totalPaise: number;
  createdAt: Date;
  pgName: string;
  pgSlug: string;
  bedCount: number;
  /** Earliest check-in across the booking's primary reservations. */
  checkInDate: string | null;
};

/**
 * List every booking attached to a given phone number. The phone arg is
 * trusted to already be normalised (use `src/lib/phone.ts`); the equality
 * is exact so a callers's normaliser disagreement won't leak data.
 *
 * Caller MUST treat the phone itself as the bearer credential — return the
 * empty list (not an error) when no rows match so we don't disclose
 * whether the number is registered.
 */
function myBookingsSelect() {
  return {
    id: bookings.id,
    bookingCode: bookings.bookingCode,
    status: bookings.status,
    durationMode: bookings.durationMode,
    expectedCheckoutDate: bookings.expectedCheckoutDate,
    totalPaise: bookings.totalPaise,
    createdAt: bookings.createdAt,
    pgName: sql<string>`(
      select pgs.name
      from pgs
      inner join floors on floors.pg_id = pgs.id
      inner join rooms on rooms.floor_id = floors.id
      inner join beds on beds.room_id = rooms.id
      inner join bed_reservations on bed_reservations.bed_id = beds.id
      where bed_reservations.booking_id = bookings.id
      limit 1
    )`,
    pgSlug: sql<string>`(
      select pgs.slug
      from pgs
      inner join floors on floors.pg_id = pgs.id
      inner join rooms on rooms.floor_id = floors.id
      inner join beds on beds.room_id = rooms.id
      inner join bed_reservations on bed_reservations.bed_id = beds.id
      where bed_reservations.booking_id = bookings.id
      limit 1
    )`,
    bedCount: sql<number>`(
      select count(*)::int from bed_reservations
      where bed_reservations.booking_id = bookings.id
        and bed_reservations.kind = 'primary'
    )`,
    checkInDate: sql<string | null>`(
      select to_char(min(lower(stay_range)), 'YYYY-MM-DD')
      from bed_reservations
      where bed_reservations.booking_id = bookings.id
        and bed_reservations.kind = 'primary'
    )`,
  };
}

/** Session-backed My Bookings list (Phase 6). */
export function listBookingsForCustomer(
  customerId: string,
): Promise<QueryResult<MyBookingRow[]>> {
  return guard(async () => {
    return await db
      .select(myBookingsSelect())
      .from(bookings)
      .where(eq(bookings.customerId, customerId))
      .orderBy(desc(bookings.createdAt));
  });
}

/** True when the customer has at least one confirmed booking. */
export function customerHasConfirmedBooking(
  customerId: string,
): Promise<QueryResult<boolean>> {
  return guard(async () => {
    const [row] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(eq(bookings.customerId, customerId), eq(bookings.status, 'confirmed')),
      )
      .limit(1);
    return Boolean(row);
  });
}

/** @deprecated Phone lookup — removed from production UI in Phase 6. */
export function listBookingsForPhone(
  phone: string,
): Promise<QueryResult<MyBookingRow[]>> {
  return guard(async () => {
    return await db
      .select(myBookingsSelect())
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .where(eq(customers.phone, phone))
      .orderBy(desc(bookings.createdAt));
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 5 — Stay extensions
// ───────────────────────────────────────────────────────────────────────────

export type ExtensionRow = {
  id: string;
  bookingId: string;
  status: string;
  requestedBy: string;
  requestedUntilDate: string;
  extensionDurationMode: string;
  quotedTotalPaise: number;
  paymentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  bedCount: number;
};

/**
 * List every extension attached to a booking, newest first. Used by the
 * customer confirmation page + admin booking detail page.
 */
export function listExtensionsForBooking(
  bookingId: string,
): Promise<QueryResult<ExtensionRow[]>> {
  return guard(async () => {
    return await db
      .select({
        id: stayExtensions.id,
        bookingId: stayExtensions.bookingId,
        status: stayExtensions.status,
        requestedBy: stayExtensions.requestedBy,
        requestedUntilDate: stayExtensions.requestedUntilDate,
        extensionDurationMode: stayExtensions.extensionDurationMode,
        quotedTotalPaise: stayExtensions.quotedTotalPaise,
        paymentId: stayExtensions.paymentId,
        createdAt: stayExtensions.createdAt,
        updatedAt: stayExtensions.updatedAt,
        bedCount: sql<number>`coalesce(array_length(${stayExtensions.newReservationIds}, 1), 0)::int`,
      })
      .from(stayExtensions)
      .where(eq(stayExtensions.bookingId, bookingId))
      .orderBy(desc(stayExtensions.createdAt));
  });
}

export type ExtensionDetail = ExtensionRow & {
  bookingCode: string;
  bookingStatus: string;
  customerFullName: string;
  customerPhone: string;
  pgName: string;
  pgSlug: string;
  bedCodes: string[];
  fromDate: string;
  holdExpiresAt: Date | null;
};

/**
 * Fetch a single extension joined to its booking, customer, PG, and the
 * full bed-code list. Drives the customer pay page + admin extension list.
 *
 * The `fromDate` is the booking's `expected_checkout_date` AT THE TIME the
 * extension was created. We don't snapshot it on the extension row (the
 * extension reservation's daterange lower bound is the authority), so we
 * derive it from the first reservation in `new_reservation_ids`.
 */
export function getExtensionDetail(
  extensionId: string,
): Promise<QueryResult<ExtensionDetail | null>> {
  return guard(async () => {
    const [row] = await db
      .select({
        id: stayExtensions.id,
        bookingId: stayExtensions.bookingId,
        status: stayExtensions.status,
        requestedBy: stayExtensions.requestedBy,
        requestedUntilDate: stayExtensions.requestedUntilDate,
        extensionDurationMode: stayExtensions.extensionDurationMode,
        quotedTotalPaise: stayExtensions.quotedTotalPaise,
        paymentId: stayExtensions.paymentId,
        createdAt: stayExtensions.createdAt,
        updatedAt: stayExtensions.updatedAt,
        bedCount: sql<number>`coalesce(array_length(${stayExtensions.newReservationIds}, 1), 0)::int`,
        bookingCode: bookings.bookingCode,
        bookingStatus: bookings.status,
        customerFullName: customers.fullName,
        customerPhone: customers.phone,
        pgName: sql<string>`(
          select pgs.name
          from pgs
          inner join floors on floors.pg_id = pgs.id
          inner join rooms on rooms.floor_id = floors.id
          inner join beds on beds.room_id = rooms.id
          inner join bed_reservations on bed_reservations.bed_id = beds.id
          where bed_reservations.booking_id = bookings.id
            and bed_reservations.kind = 'primary'
          limit 1
        )`,
        pgSlug: sql<string>`(
          select pgs.slug
          from pgs
          inner join floors on floors.pg_id = pgs.id
          inner join rooms on rooms.floor_id = floors.id
          inner join beds on beds.room_id = rooms.id
          inner join bed_reservations on bed_reservations.bed_id = beds.id
          where bed_reservations.booking_id = bookings.id
            and bed_reservations.kind = 'primary'
          limit 1
        )`,
        bedCodes: sql<string[]>`(
          select coalesce(array_agg(beds.bed_code order by beds.bed_code), '{}'::text[])
          from beds
          where beds.id = ANY(
            select bed_id from bed_reservations
            where bed_reservations.id = ANY(${stayExtensions.newReservationIds})
          )
        )`,
        fromDate: sql<string>`(
          select to_char(lower(stay_range), 'YYYY-MM-DD')
          from bed_reservations
          where bed_reservations.id = ANY(${stayExtensions.newReservationIds})
          limit 1
        )`,
        holdExpiresAt: sql<Date | null>`(
          select min(hold_expires_at)
          from bed_reservations
          where bed_reservations.id = ANY(${stayExtensions.newReservationIds})
            and bed_reservations.status = 'hold'
        )`,
      })
      .from(stayExtensions)
      .innerJoin(bookings, eq(bookings.id, stayExtensions.bookingId))
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .where(eq(stayExtensions.id, extensionId))
      .limit(1);
    return row ?? null;
  });
}

/**
 * Used by the booking-code generator: count how many bookings already exist
 * with codes starting with `prefix-YYYY-`. Cheap because the index is on
 * `booking_code` itself.
 */
export async function countBookingsInYear(
  yearPrefix: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(sql`${bookings.bookingCode} LIKE ${yearPrefix + '%'}`);
  return row?.count ?? 0;
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 5.5 — resident billing reads (customer-facing)
// ───────────────────────────────────────────────────────────────────────────

export type ResidentBookingRow = {
  bookingId: string;
  bookingCode: string;
  customerId: string;
  customerFullName: string;
  customerPhone: string;
  pgId: string;
  pgName: string;
  pgSlug: string;
  bedCode: string;
  roomId: string;
  roomNumber: string;
  durationMode: 'monthly' | 'open_ended';
  status: 'confirmed' | 'completed' | 'cancelled' | 'refunded' | 'draft' | 'pending_payment';
  checkInDate: string; // YYYY-MM-DD
  expectedCheckoutDate: string | null;
  monthlyRentPaise: number;
  depositPaise: number;
  adminDuesStatus: 'unknown' | 'cleared' | 'has_dues';
  adminDepositRefundStatus:
    | 'unknown'
    | 'pending'
    | 'refunded'
    | 'blocked'
    | 'not_applicable';
};

/** One row per booking — multi-bed bookings keep the lowest bed_id row. */
function dedupeResidentBookingsByBookingId(
  rows: ResidentBookingRow[],
): ResidentBookingRow[] {
  return Array.from(new Map(rows.map((item) => [item.bookingId, item])).values());
}

/**
 * List monthly bookings owned by `customerId`. Returns ONE row per booking.
 * Multi-bed bookings join one row per primary reservation; we collapse to a
 * single representative bed (lowest bed_id) for the resident dashboard.
 */
export function listResidentBookingsForCustomer(
  customerId: string,
): Promise<QueryResult<ResidentBookingRow[]>> {
  return guard(async () => {
    const rows = await db
      .select({
        bookingId: bookings.id,
        bookingCode: bookings.bookingCode,
        customerId: bookings.customerId,
        customerFullName: customers.fullName,
        customerPhone: customers.phone,
        bedId: bedReservations.bedId,
        bedCode: beds.bedCode,
        roomId: rooms.id,
        roomNumber: rooms.roomNumber,
        pgId: pgs.id,
        pgName: pgs.name,
        pgSlug: pgs.slug,
        durationMode: bookings.durationMode,
        status: bookings.status,
        checkInDate: sql<string>`to_char(lower(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
        expectedCheckoutDate: bookings.expectedCheckoutDate,
        pricingSnapshot: bookings.pricingSnapshot,
        depositPaise: bookings.depositPaise,
        adminDuesStatus: bookings.adminDuesStatus,
        adminDepositRefundStatus: bookings.adminDepositRefundStatus,
      })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .innerJoin(bedReservations, and(
        eq(bedReservations.bookingId, bookings.id),
        eq(bedReservations.kind, 'primary'),
      ))
      .innerJoin(beds, eq(beds.id, bedReservations.bedId))
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .innerJoin(floors, eq(floors.id, rooms.floorId))
      .innerJoin(pgs, eq(pgs.id, floors.pgId))
      .where(
        and(
          eq(bookings.customerId, customerId),
          inArray(bookings.durationMode, ['monthly', 'open_ended']),
          inArray(bookings.status, ['confirmed', 'completed']),
        ),
      )
      .orderBy(desc(bookings.createdAt), asc(bedReservations.bedId));

    const mapped = rows.map((r) => {
      const snapshot = r.pricingSnapshot as PricingSnapshot | null;
      const monthlyRentPaise = snapshot?.perBed.reduce(
        (acc, b) => acc + (b.monthlyRatePaise ?? 0),
        0,
      ) ?? 0;
      return {
        bookingId: r.bookingId,
        bookingCode: r.bookingCode,
        customerId: r.customerId,
        customerFullName: r.customerFullName,
        customerPhone: r.customerPhone,
        pgId: r.pgId,
        pgName: r.pgName,
        pgSlug: r.pgSlug,
        bedCode: r.bedCode,
        roomId: r.roomId,
        roomNumber: r.roomNumber,
        durationMode: r.durationMode as 'monthly' | 'open_ended',
        status: r.status,
        checkInDate: r.checkInDate,
        expectedCheckoutDate: r.expectedCheckoutDate,
        monthlyRentPaise,
        depositPaise: r.depositPaise,
        adminDuesStatus: r.adminDuesStatus,
        adminDepositRefundStatus: r.adminDepositRefundStatus,
      };
    });

    return dedupeResidentBookingsByBookingId(mapped);
  });
}

export type RentInvoiceRow = {
  id: string;
  invoiceNumber: string;
  bookingId: string;
  bookingCode: string;
  billingMonth: string;
  dueDate: string;
  rentPaise: number;
  paidPrincipalPaise: number;
  paidLateFeePaise: number;
  lateFeeLockedPaise: number | null;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  paidAt: Date | null;
  notes: string | null;
};

export function listRentInvoicesForBooking(
  bookingId: string,
): Promise<QueryResult<RentInvoiceRow[]>> {
  return guard(async () => {
    return db
      .select({
        id: rentInvoices.id,
        invoiceNumber: rentInvoices.invoiceNumber,
        bookingId: rentInvoices.bookingId,
        bookingCode: bookings.bookingCode,
        billingMonth: rentInvoices.billingMonth,
        dueDate: rentInvoices.dueDate,
        rentPaise: rentInvoices.rentPaise,
        paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
        paidLateFeePaise: rentInvoices.paidLateFeePaise,
        lateFeeLockedPaise: rentInvoices.lateFeeLockedPaise,
        status: rentInvoices.status,
        paidAt: rentInvoices.paidAt,
        notes: rentInvoices.notes,
      })
      .from(rentInvoices)
      .innerJoin(bookings, eq(bookings.id, rentInvoices.bookingId))
      .where(eq(rentInvoices.bookingId, bookingId))
      .orderBy(desc(rentInvoices.billingMonth));
  });
}

export type ElectricityInvoiceRow = {
  id: string;
  invoiceNumber: string;
  bookingId: string;
  bookingCode: string;
  electricityBillId: string;
  billingMonth: string;
  dueDate: string;
  amountPaise: number;
  paidPaise: number;
  lateFeeLockedPaise: number | null;
  status: 'pending' | 'paid' | 'cancelled';
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roomNumber: string;
  previousReadingUnits: string;
  currentReadingUnits: string;
  unitsConsumed: string;
  ratePerUnitPaise: number;
  totalPaise: number;
  monthlyOccupantCount: number;
};

export function listElectricityInvoicesForBooking(
  bookingId: string,
): Promise<QueryResult<ElectricityInvoiceRow[]>> {
  return guard(async () => {
    return db
      .select({
        id: electricityInvoices.id,
        invoiceNumber: electricityInvoices.invoiceNumber,
        bookingId: electricityInvoices.bookingId,
        bookingCode: bookings.bookingCode,
        electricityBillId: electricityInvoices.electricityBillId,
        billingMonth: electricityInvoices.billingMonth,
        dueDate: electricityInvoices.dueDate,
        amountPaise: electricityInvoices.amountPaise,
        paidPaise: electricityInvoices.paidPaise,
        lateFeeLockedPaise: electricityInvoices.lateFeeLockedPaise,
        status: electricityInvoices.status,
        paidAt: electricityInvoices.paidAt,
        createdAt: electricityInvoices.createdAt,
        updatedAt: electricityInvoices.updatedAt,
        roomNumber: rooms.roomNumber,
        previousReadingUnits: electricityBills.previousReadingUnits,
        currentReadingUnits: electricityBills.currentReadingUnits,
        unitsConsumed: electricityBills.unitsConsumed,
        ratePerUnitPaise: electricityBills.ratePerUnitPaise,
        totalPaise: electricityBills.totalPaise,
        monthlyOccupantCount: electricityBills.monthlyOccupantCount,
      })
      .from(electricityInvoices)
      .innerJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
      .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
      .innerJoin(rooms, eq(rooms.id, electricityBills.roomId))
      .where(eq(electricityInvoices.bookingId, bookingId))
      .orderBy(desc(electricityInvoices.billingMonth));
  });
}

export type VacatingForBookingRow = {
  id: string;
  bookingId: string;
  noticeGivenDate: string;
  vacatingDate: string;
  noticeCompliant: boolean;
  deductionPaise: number;
  depositRefundPaise: number;
  monthlyRentPaiseSnapshot: number;
  status: 'pending' | 'approved' | 'completed' | 'rejected';
  notes: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
};

export function getVacatingForBooking(
  bookingId: string,
): Promise<QueryResult<VacatingForBookingRow | null>> {
  return guard(async () => {
    const [row] = await db
      .select()
      .from(vacatingRequests)
      .where(eq(vacatingRequests.bookingId, bookingId))
      .limit(1);
    return row ?? null;
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Payment history (resident-facing)
// ───────────────────────────────────────────────────────────────────────────

export type PaymentHistoryRow = {
  id: string;
  bookingId: string;
  bookingCode: string;
  purpose:
    | 'booking'
    | 'extension'
    | 'rent'
    | 'electricity'
    | 'refund'
    | 'deposit'
    | 'deposit_deduction'
    | 'adjustment'
    | 'bed_reserve';
  provider: string;
  providerPaymentId: string | null;
  amountPaise: number;
  status: 'initiated' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded';
  paidAt: Date | null;
  createdAt: Date;
};

/**
 * All payment rows attached to a booking, newest first. Used by the
 * resident-facing payment-history page. Status is reported as-is so
 * failed/refunded attempts are visible to the customer (matches the
 * existing extension/booking confirmation pages).
 */
export type PaymentReceiptRow = {
  id: string;
  bookingId: string;
  bookingCode: string;
  purpose: string;
  provider: string;
  providerPaymentId: string | null;
  providerOrderId: string | null;
  amountPaise: number;
  status: string;
  paidAt: Date | null;
  createdAt: Date;
  pgName: string;
  customerName: string;
};

export function getPaymentForCustomer(
  paymentId: string,
  customerId: string,
): Promise<QueryResult<PaymentReceiptRow>> {
  return guard(async () => {
    const [row] = await db
      .select({
        id: payments.id,
        bookingId: payments.bookingId,
        bookingCode: bookings.bookingCode,
        purpose: payments.purpose,
        provider: payments.provider,
        providerPaymentId: payments.providerPaymentId,
        providerOrderId: payments.providerOrderId,
        amountPaise: payments.amountPaise,
        status: payments.status,
        paidAt: payments.paidAt,
        createdAt: payments.createdAt,
        pgName: sql<string>`(
          select pgs.name
          from ${bedReservations} br
          inner join ${beds} b on b.id = br.bed_id
          inner join ${rooms} r on r.id = b.room_id
          inner join ${floors} f on f.id = r.floor_id
          inner join ${pgs} pgs on pgs.id = f.pg_id
          where br.booking_id = ${bookings.id}
          limit 1
        )`,
        customerName: customers.fullName,
      })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .where(and(eq(payments.id, paymentId), eq(bookings.customerId, customerId)))
      .limit(1);
    if (!row) throw new Error('Payment not found.');
    return { ...row, pgName: row.pgName ?? '—' };
  });
}

export function listPaymentsForBooking(
  bookingId: string,
): Promise<QueryResult<PaymentHistoryRow[]>> {
  return guard(async () => {
    return await db
      .select({
        id: payments.id,
        bookingId: payments.bookingId,
        bookingCode: bookings.bookingCode,
        purpose: payments.purpose,
        provider: payments.provider,
        providerPaymentId: payments.providerPaymentId,
        amountPaise: payments.amountPaise,
        status: payments.status,
        paidAt: payments.paidAt,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .where(eq(payments.bookingId, bookingId))
      .orderBy(desc(payments.createdAt));
  });
}

// re-export to satisfy unused-import linters when consumers only need one.
export const _internal = { desc };

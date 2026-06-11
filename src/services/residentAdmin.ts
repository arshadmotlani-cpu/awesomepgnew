import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgs,
  rooms,
} from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { formatDate } from '@/src/lib/dates';
import { isBedAvailable } from '@/src/services/availability';
import { recordDepositCollected } from '@/src/services/deposits';
import { siblingBedIdsInRoom } from '@/src/services/tenantAssignmentInternals';

const LONG_TERM_END = '2099-01-01';

export type ResidentListRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  gender: 'male' | 'female' | 'other';
  kycStatus: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  tenancyStatus: 'unassigned' | 'active';
  pgName: string | null;
  roomNumber: string | null;
  bedCode: string | null;
  bookingId: string | null;
};

export type ResidentDetail = {
  customer: {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    gender: 'male' | 'female' | 'other';
    kycStatus: 'pending' | 'approved' | 'rejected';
    createdAt: Date;
  };
  activeTenancy: {
    bookingId: string;
    bookingCode: string;
    pgId: string;
    pgName: string;
    roomNumber: string;
    bedId: string;
    bedCode: string;
    monthlyRentPaise: number;
    depositPaise: number;
    blocksRoomAvailability: boolean;
    moveInDate: string;
  } | null;
  canArchive: boolean;
};

export async function listResidentsForAdmin(session: AdminSession): Promise<ResidentListRow[]> {
  const rows = await db.execute<{
    id: string;
    full_name: string;
    email: string;
    phone: string;
    gender: 'male' | 'female' | 'other';
    kyc_status: 'pending' | 'approved' | 'rejected';
    created_at: Date;
    booking_id: string | null;
    pg_name: string | null;
    room_number: string | null;
    bed_code: string | null;
    pg_id: string | null;
  }>(sql`
    SELECT
      c.id,
      c.full_name,
      c.email,
      c.phone,
      c.gender,
      c.kyc_status,
      c.created_at,
      t.booking_id,
      t.pg_name,
      t.room_number,
      t.bed_code,
      t.pg_id
    FROM customers c
    LEFT JOIN LATERAL (
      SELECT
        b.id::text AS booking_id,
        p.name AS pg_name,
        r.room_number,
        bd.bed_code,
        f.pg_id::text AS pg_id
      FROM bookings b
      INNER JOIN bed_reservations br ON br.booking_id = b.id
      INNER JOIN beds bd ON bd.id = br.bed_id
      INNER JOIN rooms r ON r.id = bd.room_id
      INNER JOIN floors f ON f.id = r.floor_id
      INNER JOIN pgs p ON p.id = f.pg_id
      WHERE b.customer_id = c.id
        AND b.status = 'confirmed'
        AND b.duration_mode IN ('monthly', 'open_ended')
        AND br.status = 'active'
        AND br.kind = 'primary'
        AND CURRENT_DATE <@ br.stay_range
      ORDER BY lower(br.stay_range) DESC
      LIMIT 1
    ) t ON true
    WHERE c.archived_at IS NULL
    ORDER BY c.created_at DESC
    LIMIT 200
  `);

  return Array.from(rows)
    .filter(
      (row) =>
        !row.pg_id || adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pg_id),
    )
    .map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      gender: row.gender,
      kycStatus: row.kyc_status,
      createdAt: row.created_at,
      bookingId: row.booking_id,
      pgName: row.pg_name,
      roomNumber: row.room_number,
      bedCode: row.bed_code,
      tenancyStatus: row.booking_id ? ('active' as const) : ('unassigned' as const),
    }));
}

export async function getResidentDetail(
  session: AdminSession,
  customerId: string,
): Promise<ResidentDetail | null> {
  const [customer] = await db
    .select({
      id: customers.id,
      fullName: customers.fullName,
      email: customers.email,
      phone: customers.phone,
      gender: customers.gender,
      kycStatus: customers.kycStatus,
      createdAt: customers.createdAt,
      archivedAt: customers.archivedAt,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!customer || customer.archivedAt) return null;

  const [tenancy] = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      pgId: pgs.id,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
      bedId: beds.id,
      bedCode: beds.bedCode,
      depositPaise: bookings.depositPaise,
      pricingSnapshot: bookings.pricingSnapshot,
      blocksRoomAvailability: bookings.blocksRoomAvailability,
      moveInDate: sql<string>`to_char(lower(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
    })
    .from(bookings)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        eq(bookings.customerId, customerId),
        eq(bookings.status, 'confirmed'),
        inArray(bookings.durationMode, ['monthly', 'open_ended']),
        eq(bedReservations.status, 'active'),
        eq(bedReservations.kind, 'primary'),
        sql`CURRENT_DATE <@ ${bedReservations.stayRange}`,
      ),
    )
    .orderBy(desc(bedReservations.createdAt))
    .limit(1);

  if (tenancy && !adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, tenancy.pgId)) {
    return null;
  }

  const snapshot = tenancy?.pricingSnapshot as PricingSnapshot | null;
  const monthlyRentPaise =
    snapshot?.perBed?.reduce((acc, b) => acc + (b.monthlyRatePaise ?? 0), 0) ?? 0;

  return {
    customer: {
      id: customer.id,
      fullName: customer.fullName,
      email: customer.email,
      phone: customer.phone,
      gender: customer.gender,
      kycStatus: customer.kycStatus,
      createdAt: customer.createdAt,
    },
    activeTenancy: tenancy
      ? {
          bookingId: tenancy.bookingId,
          bookingCode: tenancy.bookingCode,
          pgId: tenancy.pgId,
          pgName: tenancy.pgName,
          roomNumber: tenancy.roomNumber,
          bedId: tenancy.bedId,
          bedCode: tenancy.bedCode,
          monthlyRentPaise,
          depositPaise: tenancy.depositPaise,
          blocksRoomAvailability: tenancy.blocksRoomAvailability,
          moveInDate: tenancy.moveInDate,
        }
      : null,
    canArchive: !tenancy,
  };
}

export async function archiveResident(
  session: AdminSession,
  customerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const detail = await getResidentDetail(session, customerId);
  if (!detail) return { ok: false, error: 'Resident not found.' };
  if (!detail.canArchive) {
    return {
      ok: false,
      error: 'Cannot remove a tenant with an active bed assignment. Cancel or complete their booking first.',
    };
  }

  await db
    .update(customers)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(customers.id, customerId));

  return { ok: true };
}

export async function updateTenantTenancy(
  session: AdminSession,
  input: {
    bookingId: string;
    newBedId?: string;
    monthlyRentInr?: number;
    additionalDepositInr?: number;
    blocksWholeRoom?: boolean;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [booking] = await db
    .select({
      id: bookings.id,
      customerId: bookings.customerId,
      pricingSnapshot: bookings.pricingSnapshot,
      blocksRoomAvailability: bookings.blocksRoomAvailability,
    })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);
  if (!booking) return { ok: false, error: 'Booking not found.' };

  const [ctx] = await db
    .select({
      pgId: pgs.id,
      bedId: beds.id,
      roomNumber: rooms.roomNumber,
    })
    .from(bedReservations)
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        eq(bedReservations.bookingId, input.bookingId),
        eq(bedReservations.kind, 'primary'),
        eq(bedReservations.status, 'active'),
      ),
    )
    .limit(1);
  if (!ctx) return { ok: false, error: 'No active bed assignment found.' };
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, ctx.pgId)) {
    return { ok: false, error: 'Access denied.' };
  }

  const today = formatDate(new Date());
  const snapshot = (booking.pricingSnapshot ?? { perBed: [], computedAt: new Date().toISOString() }) as PricingSnapshot;
  const primaryBedId = snapshot.perBed[0]?.bedId ?? ctx.bedId;
  const newBedId = input.newBedId?.trim() || primaryBedId;
  const blocksWholeRoom = input.blocksWholeRoom ?? booking.blocksRoomAvailability;

  if (newBedId !== primaryBedId) {
    const available = await isBedAvailable({
      bedId: newBedId,
      startDate: today,
      endDate: LONG_TERM_END,
    });
    if (!available) {
      return { ok: false, error: 'Selected bed is not available for those dates.' };
    }

    await db.execute(sql`
      UPDATE bed_reservations
      SET status = 'completed', updated_at = now()
      WHERE booking_id = ${input.bookingId}
        AND status = 'active'
    `);

    const reservationBedIds = blocksWholeRoom
      ? [newBedId, ...(await siblingBedIdsInRoom(newBedId))]
      : [newBedId];

    for (const bedId of reservationBedIds) {
      await db.insert(bedReservations).values({
        bookingId: input.bookingId,
        bedId,
        stayRange: sql`daterange(${today}::date, ${LONG_TERM_END}::date, '[)')` as unknown as string,
        kind: 'primary',
        status: 'active',
      });
    }

    if (snapshot.perBed[0]) {
      snapshot.perBed[0].bedId = newBedId;
    }
  }

  if (input.monthlyRentInr != null && input.monthlyRentInr >= 0 && snapshot.perBed[0]) {
    const paise = Math.round(input.monthlyRentInr * 100);
    snapshot.perBed[0].monthlyRatePaise = paise;
    snapshot.perBed[0].lineTotalPaise = paise * Math.max(1, snapshot.perBed[0].units ?? 1);
  }

  await db
    .update(bookings)
    .set({
      pricingSnapshot: snapshot,
      blocksRoomAvailability: blocksWholeRoom,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, input.bookingId));

  if (input.additionalDepositInr != null && input.additionalDepositInr > 0) {
    const paise = Math.round(input.additionalDepositInr * 100);
    await recordDepositCollected({
      bookingId: input.bookingId,
      customerId: booking.customerId,
      amountPaise: paise,
      reason: 'Additional deposit recorded by admin',
      createdByAdminId: session.adminId,
    });
  }

  return { ok: true };
}

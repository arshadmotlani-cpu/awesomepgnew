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
  auditLog,
} from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { BLOCKING_RESERVATION_STATUS_SQL } from '@/src/lib/reservationBlocking';
import {
  customerIsVerifiedSql,
  customerIsWebsiteSignupSql,
  customerVerificationSelectSql,
  mapVerificationStatus,
  type ResidentVerificationSource,
  type ResidentVerificationStatus,
} from '@/src/lib/residentVerification';
import { formatDate, parseDate } from '@/src/lib/dates';
import { isBedAvailable } from '@/src/services/availability';
import { correctDepositCollected, getDepositSummaryForBooking } from '@/src/services/deposits';
import { recalculatePendingRentInvoicesForBooking } from '@/src/services/rentInvoices';
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
  tenancyStatus: 'unassigned' | 'active' | 'vacating';
  pgId: string | null;
  pgName: string | null;
  roomNumber: string | null;
  bedCode: string | null;
  bookingId: string | null;
  verificationSource: ResidentVerificationSource;
};

export type UnverifiedWebsiteSignupRow = ResidentListRow & {
  verificationSource: null;
  hasPendingPayment: boolean;
  hasPendingKycSubmission: boolean;
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

type ResidentListDbRow = {
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
  is_vacating: boolean;
  is_website_signup: boolean;
  is_verified: boolean;
  verified_via_kyc: boolean;
  verified_via_payment: boolean;
  has_pending_payment: boolean;
  has_pending_kyc_submission: boolean;
};

function mapResidentListRow(row: ResidentListDbRow): ResidentListRow {
  const verification = mapVerificationStatus(row);
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    gender: row.gender,
    kycStatus: row.kyc_status,
    createdAt: row.created_at,
    bookingId: row.booking_id,
    pgId: row.pg_id,
    pgName: row.pg_name,
    roomNumber: row.room_number,
    bedCode: row.bed_code,
    tenancyStatus: !row.booking_id
      ? 'unassigned'
      : row.is_vacating
        ? 'vacating'
        : 'active',
    verificationSource: verification.verificationSource,
  };
}

function mapUnverifiedSignupRow(row: ResidentListDbRow): UnverifiedWebsiteSignupRow {
  const base = mapResidentListRow(row);
  return {
    ...base,
    verificationSource: null,
    hasPendingPayment: row.has_pending_payment,
    hasPendingKycSubmission: row.has_pending_kyc_submission,
  };
}

const activeTenancyLateralSql = sql`
  LEFT JOIN LATERAL (
    SELECT
      b.id::text AS booking_id,
      p.name AS pg_name,
      r.room_number,
      bd.bed_code,
      f.pg_id::text AS pg_id,
      EXISTS (
        SELECT 1 FROM vacating_requests vr
        WHERE vr.booking_id = b.id
          AND vr.status IN ('pending', 'approved')
      ) AS is_vacating
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
`;

export async function getCustomerVerificationStatus(
  customerId: string,
): Promise<ResidentVerificationStatus | null> {
  const rows = await db.execute<{
    is_website_signup: boolean;
    is_verified: boolean;
    verified_via_kyc: boolean;
    verified_via_payment: boolean;
    has_pending_payment: boolean;
  }>(sql`
    SELECT
      ${customerVerificationSelectSql},
      EXISTS (
        SELECT 1 FROM kyc_submissions ks
        WHERE ks.customer_id = c.id AND ks.status = 'pending'
      ) AS has_pending_kyc_submission
    FROM customers c
    WHERE c.id = ${customerId}::uuid
      AND c.archived_at IS NULL
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) return null;
  return mapVerificationStatus(row);
}

export async function listResidentsForAdmin(session: AdminSession): Promise<ResidentListRow[]> {
  const rows = await db.execute<ResidentListDbRow>(sql`
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
      t.pg_id,
      coalesce(t.is_vacating, false) AS is_vacating,
      ${customerVerificationSelectSql},
      EXISTS (
        SELECT 1 FROM kyc_submissions ks
        WHERE ks.customer_id = c.id AND ks.status = 'pending'
      ) AS has_pending_kyc_submission
    FROM customers c
    ${activeTenancyLateralSql}
    WHERE c.archived_at IS NULL
      AND ${customerIsVerifiedSql}
    ORDER BY c.created_at DESC
    LIMIT 200
  `);

  return Array.from(rows)
    .filter(
      (row) =>
        !row.pg_id || adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pg_id),
    )
    .map(mapResidentListRow);
}

export async function listUnverifiedWebsiteSignupsForAdmin(
  session: AdminSession,
): Promise<UnverifiedWebsiteSignupRow[]> {
  const rows = await db.execute<ResidentListDbRow>(sql`
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
      t.pg_id,
      coalesce(t.is_vacating, false) AS is_vacating,
      ${customerVerificationSelectSql},
      EXISTS (
        SELECT 1 FROM kyc_submissions ks
        WHERE ks.customer_id = c.id AND ks.status = 'pending'
      ) AS has_pending_kyc_submission
    FROM customers c
    ${activeTenancyLateralSql}
    WHERE c.archived_at IS NULL
      AND ${customerIsWebsiteSignupSql}
      AND NOT ${customerIsVerifiedSql}
    ORDER BY
      (t.booking_id IS NOT NULL) DESC,
      c.created_at DESC
    LIMIT 200
  `);

  return Array.from(rows)
    .filter(
      (row) =>
        !row.pg_id || adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pg_id),
    )
    .map(mapUnverifiedSignupRow);
}

export async function searchResidentsForAdmin(
  session: AdminSession,
  query: string,
  limit = 20,
): Promise<ResidentListRow[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const pattern = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
  const phoneDigits = q.replace(/\D/g, '');

  const rows = await db.execute<ResidentListDbRow>(sql`
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
      t.pg_id,
      coalesce(t.is_vacating, false) AS is_vacating,
      ${customerVerificationSelectSql},
      EXISTS (
        SELECT 1 FROM kyc_submissions ks
        WHERE ks.customer_id = c.id AND ks.status = 'pending'
      ) AS has_pending_kyc_submission
    FROM customers c
    ${activeTenancyLateralSql}
    WHERE c.archived_at IS NULL
      AND ${customerIsVerifiedSql}
      AND (
        c.full_name ILIKE ${pattern}
        OR c.email ILIKE ${pattern}
        OR (
          ${phoneDigits.length >= 3}
          AND regexp_replace(c.phone, '[^0-9]', '', 'g') LIKE ${`%${phoneDigits}%`}
        )
      )
    ORDER BY c.created_at DESC
    LIMIT ${limit}
  `);

  return Array.from(rows)
    .filter(
      (row) =>
        !row.pg_id || adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pg_id),
    )
    .map(mapResidentListRow);
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
    depositCollectedInr?: number;
    blocksWholeRoom?: boolean;
  },
): Promise<
  | {
      ok: true;
      pgId: string;
      customerId: string;
      pgName: string;
      roomNumber: string;
      rentChanged?: { fromPaise: number; toPaise: number };
    }
  | { ok: false; error: string }
> {
  const [booking] = await db
    .select({
      id: bookings.id,
      customerId: bookings.customerId,
      depositPaise: bookings.depositPaise,
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
      pgName: pgs.name,
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
  const oldMonthlyRentPaise = snapshot.perBed.reduce(
    (acc, bed) => acc + (bed.monthlyRatePaise ?? 0),
    0,
  );
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

  const subtotalPaise = snapshot.perBed.reduce((acc, bed) => acc + (bed.lineTotalPaise ?? 0), 0);

  await db
    .update(bookings)
    .set({
      pricingSnapshot: snapshot,
      subtotalPaise,
      blocksRoomAvailability: blocksWholeRoom,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, input.bookingId));

  if (input.depositCollectedInr != null && input.depositCollectedInr >= 0) {
    const targetPaise = Math.round(input.depositCollectedInr * 100);
    const summary = await getDepositSummaryForBooking(input.bookingId);
    const ledgerCollectedPaise = summary?.collectedPaise ?? 0;
    if (targetPaise !== booking.depositPaise || targetPaise !== ledgerCollectedPaise) {
      await correctDepositCollected({
        bookingId: input.bookingId,
        customerId: booking.customerId,
        targetCollectedPaise: targetPaise,
        reason: 'Deposit corrected from resident profile',
        createdByAdminId: session.adminId,
      });
    }
  }

  const newMonthlyRentPaise = snapshot.perBed.reduce(
    (acc, bed) => acc + (bed.monthlyRatePaise ?? 0),
    0,
  );
  const rentChanged =
    newMonthlyRentPaise !== oldMonthlyRentPaise
      ? { fromPaise: oldMonthlyRentPaise, toPaise: newMonthlyRentPaise }
      : undefined;

  if (rentChanged) {
    await recalculatePendingRentInvoicesForBooking({
      bookingId: input.bookingId,
      pricingSnapshot: snapshot,
      adminId: session.adminId,
    });

    await db.insert(auditLog).values({
      actorType: 'admin',
      actorId: session.adminId,
      entity: 'booking',
      entityId: input.bookingId,
      action: 'rent_updated',
      diff: {
        customerId: booking.customerId,
        pgId: ctx.pgId,
        fromMonthlyRentPaise: rentChanged.fromPaise,
        toMonthlyRentPaise: rentChanged.toPaise,
      },
    });
  }

  return {
    ok: true,
    pgId: ctx.pgId,
    customerId: booking.customerId,
    pgName: ctx.pgName,
    roomNumber: ctx.roomNumber,
    rentChanged,
  };
}

/** Move an active tenancy to a future reservation — bed stays bookable until move-in. */
export async function shiftBookingToReservation(
  session: AdminSession,
  input: { bookingId: string; moveInDate: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const moveInDate = formatDate(parseDate(input.moveInDate));
  const today = formatDate(new Date());
  if (moveInDate <= today) {
    return { ok: false, error: 'Reservation move-in must be after today.' };
  }

  const [ctx] = await db
    .select({
      pgId: pgs.id,
      bedId: beds.id,
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

  const [conflict] = await db
    .select({ id: bedReservations.id })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .where(
      and(
        eq(bedReservations.bedId, ctx.bedId),
        sql`${bedReservations.status} IN ${sql.raw(BLOCKING_RESERVATION_STATUS_SQL)}`,
        sql`${bedReservations.stayRange} && daterange(${moveInDate}::date, ${LONG_TERM_END}::date, '[)')`,
        sql`${bedReservations.bookingId} <> ${input.bookingId}`,
      ),
    )
    .limit(1);
  if (conflict) {
    return { ok: false, error: 'Bed is not free from that move-in date.' };
  }

  await db.execute(sql`
    UPDATE bed_reservations
    SET
      stay_range = daterange(${moveInDate}::date, ${LONG_TERM_END}::date, '[)'),
      updated_at = now()
    WHERE booking_id = ${input.bookingId}
      AND status = 'active'
  `);

  await db
    .update(bookings)
    .set({ expectedCheckoutDate: LONG_TERM_END, updatedAt: new Date() })
    .where(eq(bookings.id, input.bookingId));

  return { ok: true };
}

/** Mark a future reservation as active from today (resident has moved in). */
export async function activateReservationNow(
  session: AdminSession,
  input: { bookingId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const today = formatDate(new Date());

  const [ctx] = await db
    .select({
      pgId: pgs.id,
      bedId: beds.id,
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
        sql`lower(${bedReservations.stayRange}) > ${today}::date`,
      ),
    )
    .limit(1);
  if (!ctx) return { ok: false, error: 'No future reservation found for this booking.' };
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, ctx.pgId)) {
    return { ok: false, error: 'Access denied.' };
  }

  await db.execute(sql`
    UPDATE bed_reservations
    SET
      stay_range = daterange(${today}::date, upper(stay_range), '[)'),
      updated_at = now()
    WHERE booking_id = ${input.bookingId}
      AND status = 'active'
  `);

  const { clearBedAdminMarks } = await import('@/src/services/bookingAdminOps');
  await clearBedAdminMarks(ctx.bedId);

  return { ok: true };
}

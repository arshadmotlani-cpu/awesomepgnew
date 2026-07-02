import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgs,
  rentInvoices,
  residentBillingProfiles,
  rooms,
  auditLog,
  vacatingRequests,
} from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import type { ResidencyStatus } from '@/src/db/schema/enums';
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
import { assertBookingOperationalGates } from '@/src/lib/occupancyEligibility';
import { isNotOccupancyPlaceholderCustomerSql } from '@/src/lib/occupancySqlFilters';
import {
  activeTenancyLateralSql,
  deriveTenancyStatus,
  getActiveTenancyForCustomer,
  onboardingBedAssignmentLateralSql,
} from '@/src/lib/residentActiveTenancy';
import { formatDate, parseDate } from '@/src/lib/dates';
import { isBedAvailable } from '@/src/services/availability';
import { correctDepositCollected, getDepositSummaryForBooking } from '@/src/services/deposits';
import {
  recalculatePendingRentInvoicesForBooking,
  recalculateRentAfterMoveInChange,
} from '@/src/services/rentInvoices';
import { billingDayFromMoveIn } from '@/src/services/billing';
import { siblingBedIdsInRoom } from '@/src/services/tenantAssignmentInternals';
import { isUnboundedStayUpper } from '@/src/lib/dates';

export type ResidentListRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  gender: 'male' | 'female' | 'other';
  kycStatus: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  tenancyStatus: 'unassigned' | 'active' | 'vacating' | 'vacated' | 'blocked';
  pgId: string | null;
  pgName: string | null;
  roomNumber: string | null;
  bedCode: string | null;
  roomId: string | null;
  bedId: string | null;
  monthlyRentPaise: number;
  bookingId: string | null;
  bookingCode: string | null;
  moveInDate: string | null;
  verificationSource: ResidentVerificationSource;
  onboardingBookingId: string | null;
  onboardingBookingStatus: string | null;
  onboardingBookingCode: string | null;
  onboardingPaymentApproved: boolean;
  hasPendingKycSubmission: boolean;
};

export type UnverifiedWebsiteSignupRow = ResidentListRow & {
  verificationSource: null;
  hasPendingPayment: boolean;
  hasPendingKycSubmission: boolean;
};

export type SettledTenancy = {
  bookingId: string;
  bookingCode: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  vacatingDate: string | null;
  deductionPaise: number | null;
  depositRefundPaise: number | null;
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
    residencyStatus: ResidencyStatus;
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
    durationMode: string;
    stayType: string;
    expectedCheckoutDate: string | null;
  } | null;
  settledTenancy: SettledTenancy | null;
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
  booking_code: string | null;
  pg_name: string | null;
  room_number: string | null;
  bed_code: string | null;
  pg_id: string | null;
  room_id: string | null;
  bed_id: string | null;
  monthly_rent_paise: number | null;
  move_in_date: string | null;
  is_vacating: boolean;
  residency_status?: ResidencyStatus;
  is_website_signup: boolean;
  is_verified: boolean;
  verified_via_kyc: boolean;
  verified_via_payment: boolean;
  has_pending_payment: boolean;
  has_pending_kyc_submission: boolean;
  onboarding_booking_id: string | null;
  onboarding_booking_code: string | null;
  onboarding_booking_status: string | null;
  onboarding_payment_approved: boolean;
  has_completed_booking: boolean;
};

import {
  hasCustomerLifecycleColumns,
  resolveBookingIdForCustomer,
  searchResidentsForAdmin as searchResidentsCore,
} from '@/src/services/adminResidentSearch';

export { hasCustomerLifecycleColumns, resolveBookingIdForCustomer };

function mapResidentListRow(row: ResidentListDbRow): ResidentListRow {
  const verification = mapVerificationStatus(row);
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    gender: row.gender,
    kycStatus: row.kyc_status,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    bookingId: row.booking_id,
    bookingCode: row.booking_code,
    pgId: row.pg_id,
    pgName: row.pg_name,
    roomNumber: row.room_number,
    bedCode: row.bed_code,
    roomId: row.room_id ?? null,
    bedId: row.bed_id ?? null,
    monthlyRentPaise: Number(row.monthly_rent_paise ?? 0),
    moveInDate: row.move_in_date ?? null,
    tenancyStatus: deriveTenancyStatus({
      residencyStatus: row.residency_status,
      activeTenancy: row.booking_id
        ? { bookingId: row.booking_id, isVacating: row.is_vacating }
        : null,
      bedId: row.bed_id,
      hasCompletedTenancy: row.has_completed_booking,
    }),
    verificationSource: verification.verificationSource,
    onboardingBookingId: row.onboarding_booking_id,
    onboardingBookingStatus: row.onboarding_booking_status,
    onboardingBookingCode: row.onboarding_booking_code,
    onboardingPaymentApproved: row.onboarding_payment_approved,
    hasPendingKycSubmission: row.has_pending_kyc_submission,
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
      c.residency_status,
      t.booking_id,
      t.booking_code,
      t.pg_name,
      t.room_number,
      t.bed_code,
      t.room_id,
      t.bed_id,
      t.monthly_rent_paise,
      t.move_in_date,
      t.pg_id,
      coalesce(t.is_vacating, false) AS is_vacating,
      ${customerVerificationSelectSql},
      EXISTS (
        SELECT 1 FROM kyc_submissions ks
        WHERE ks.customer_id = c.id AND ks.status = 'pending'
      ) AS has_pending_kyc_submission,
      ob.onboarding_booking_id,
      ob.onboarding_booking_code,
      ob.onboarding_booking_status,
      coalesce(ob.onboarding_payment_approved, false) AS onboarding_payment_approved,
      EXISTS (
        SELECT 1 FROM bookings b_done
        WHERE b_done.customer_id = c.id AND b_done.status = 'completed'
      ) AS has_completed_booking
    FROM customers c
    ${activeTenancyLateralSql}
    ${onboardingBedAssignmentLateralSql}
    WHERE c.archived_at IS NULL
      AND ${isNotOccupancyPlaceholderCustomerSql}
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
      c.residency_status,
      t.booking_id,
      t.booking_code,
      t.pg_name,
      t.room_number,
      t.bed_code,
      t.room_id,
      t.bed_id,
      t.monthly_rent_paise,
      t.move_in_date,
      t.pg_id,
      coalesce(t.is_vacating, false) AS is_vacating,
      ${customerVerificationSelectSql},
      EXISTS (
        SELECT 1 FROM kyc_submissions ks
        WHERE ks.customer_id = c.id AND ks.status = 'pending'
      ) AS has_pending_kyc_submission,
      ob.onboarding_booking_id,
      ob.onboarding_booking_code,
      ob.onboarding_booking_status,
      coalesce(ob.onboarding_payment_approved, false) AS onboarding_payment_approved,
      false AS has_completed_booking
    FROM customers c
    ${activeTenancyLateralSql}
    ${onboardingBedAssignmentLateralSql}
    WHERE c.archived_at IS NULL
      AND ${isNotOccupancyPlaceholderCustomerSql}
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
  const rows = await searchResidentsCore(session, query, limit);
  return rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    email: r.email,
    phone: r.phone,
    gender: r.gender ?? 'other',
    kycStatus: r.kycStatus,
    createdAt: new Date(r.createdAt),
    tenancyStatus: r.tenancyStatus,
    pgId: r.pgId,
    pgName: r.pgName,
    roomNumber: r.roomNumber,
    bedCode: r.bedCode,
    roomId: r.roomId,
    bedId: r.bedId,
    monthlyRentPaise: r.monthlyRentPaise,
    bookingId: r.bookingId,
    bookingCode: r.bookingCode,
    moveInDate: null,
    verificationSource: r.kycStatus === 'approved' ? ('kyc' as const) : null,
    onboardingBookingId: null,
    onboardingBookingStatus: null,
    onboardingBookingCode: null,
    onboardingPaymentApproved: false,
    hasPendingKycSubmission: false,
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
      residencyStatus: customers.residencyStatus,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!customer || customer.archivedAt) return null;

  const activeTenancyRow = await getActiveTenancyForCustomer(customerId);
  if (
    activeTenancyRow &&
    !adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, activeTenancyRow.pgId)
  ) {
    return null;
  }

  let settledTenancy: SettledTenancy | null = null;
  if (!activeTenancyRow && customer.residencyStatus === 'vacated') {
    const [settled] = await db
      .select({
        bookingId: bookings.id,
        bookingCode: bookings.bookingCode,
        pgId: pgs.id,
        pgName: pgs.name,
        roomNumber: rooms.roomNumber,
        bedCode: beds.bedCode,
        vacatingDate: vacatingRequests.vacatingDate,
        deductionPaise: vacatingRequests.deductionPaise,
        depositRefundPaise: vacatingRequests.depositRefundPaise,
      })
      .from(bookings)
      .innerJoin(vacatingRequests, eq(vacatingRequests.bookingId, bookings.id))
      .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
      .innerJoin(beds, eq(beds.id, bedReservations.bedId))
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .innerJoin(floors, eq(floors.id, rooms.floorId))
      .innerJoin(pgs, eq(pgs.id, floors.pgId))
      .where(
        and(
          eq(bookings.customerId, customerId),
          eq(bookings.status, 'completed'),
          eq(vacatingRequests.status, 'completed'),
          eq(bedReservations.kind, 'primary'),
        ),
      )
      .orderBy(desc(vacatingRequests.resolvedAt))
      .limit(1);

    if (settled && adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, settled.pgId)) {
      settledTenancy = {
        bookingId: settled.bookingId,
        bookingCode: settled.bookingCode,
        pgId: settled.pgId,
        pgName: settled.pgName,
        roomNumber: settled.roomNumber,
        bedCode: settled.bedCode,
        vacatingDate: settled.vacatingDate,
        deductionPaise: settled.deductionPaise,
        depositRefundPaise: settled.depositRefundPaise,
      };
    }
  }

  return {
    customer: {
      id: customer.id,
      fullName: customer.fullName,
      email: customer.email,
      phone: customer.phone,
      gender: customer.gender,
      kycStatus: customer.kycStatus,
      createdAt: customer.createdAt,
      residencyStatus: customer.residencyStatus,
    },
    activeTenancy: activeTenancyRow
      ? {
          bookingId: activeTenancyRow.bookingId,
          bookingCode: activeTenancyRow.bookingCode,
          pgId: activeTenancyRow.pgId,
          pgName: activeTenancyRow.pgName,
          roomNumber: activeTenancyRow.roomNumber,
          bedId: activeTenancyRow.bedId,
          bedCode: activeTenancyRow.bedCode,
          monthlyRentPaise: activeTenancyRow.monthlyRentPaise,
          depositPaise: activeTenancyRow.depositPaise,
          blocksRoomAvailability: activeTenancyRow.blocksRoomAvailability,
          moveInDate: activeTenancyRow.moveInDate,
          durationMode: activeTenancyRow.durationMode,
          stayType: activeTenancyRow.stayType,
          expectedCheckoutDate: activeTenancyRow.expectedCheckoutDate,
        }
      : null,
    settledTenancy,
    canArchive: !activeTenancyRow,
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
      status: bookings.status,
      depositPaise: bookings.depositPaise,
      pricingSnapshot: bookings.pricingSnapshot,
      blocksRoomAvailability: bookings.blocksRoomAvailability,
    })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);
  if (!booking) return { ok: false, error: 'Booking not found.' };
  if (booking.status !== 'confirmed') {
    return { ok: false, error: `Booking is ${booking.status.replace('_', ' ')}; cannot update tenancy.` };
  }

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
    const gates = await assertBookingOperationalGates(input.bookingId);
    if (!gates.ok) {
      return { ok: false, error: gates.reason };
    }

    const available = await isBedAvailable({
      bedId: newBedId,
      startDate: today,
      endDate: null,
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
        stayRange: sql`daterange(${today}::date, NULL, '[)')` as unknown as string,
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

  const { reconcileBookingOccupancy } = await import('@/src/lib/occupancySync');
  await reconcileBookingOccupancy(input.bookingId);

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
        sql`${bedReservations.stayRange} && daterange(${moveInDate}::date, NULL, '[)')`,
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
      stay_range = daterange(${moveInDate}::date, NULL, '[)'),
      updated_at = now()
    WHERE booking_id = ${input.bookingId}
      AND status = 'active'
  `);

  await db
    .update(bookings)
    .set({
      expectedCheckoutDate: null,
      billingAnchorDate: moveInDate,
      updatedAt: new Date(),
    })
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

  const gates = await assertBookingOperationalGates(input.bookingId);
  if (!gates.ok) {
    return { ok: false, error: gates.reason };
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

/** Correct check-in date for an active tenant — recalculates open rent bills. */
export async function updateBookingMoveInDate(
  session: AdminSession,
  input: { bookingId: string; moveInDate: string },
): Promise<{ ok: true; invoicesUpdated: number; billingDay: number } | { ok: false; error: string }> {
  const moveInDate = formatDate(parseDate(input.moveInDate));
  const today = formatDate(new Date());

  if (moveInDate > today) {
    return {
      ok: false,
      error: 'For a future move-in, use PG bed map → Shift to reservation instead.',
    };
  }

  const [ctx] = await db
    .select({
      pgId: pgs.id,
      bedId: beds.id,
      customerId: bookings.customerId,
      currentStart: sql<string>`to_char(lower(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
      currentUpper: sql<string | null>`to_char(upper(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
    })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
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
  if (ctx.currentStart === moveInDate) {
    return { ok: false, error: 'Check-in date is already set to that day.' };
  }

  const stayEnd = ctx.currentUpper;
  const unboundedUpper = isUnboundedStayUpper(stayEnd);

  const overlapSql = unboundedUpper
    ? sql`${bedReservations.stayRange} && daterange(${moveInDate}::date, NULL, '[)')`
    : sql`${bedReservations.stayRange} && daterange(${moveInDate}::date, ${stayEnd}::date, '[)')`;

  const [conflict] = await db
    .select({ id: bedReservations.id })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .where(
      and(
        eq(bedReservations.bedId, ctx.bedId),
        sql`${bedReservations.status} IN ${sql.raw(BLOCKING_RESERVATION_STATUS_SQL)}`,
        overlapSql,
        sql`${bedReservations.bookingId} <> ${input.bookingId}`,
      ),
    )
    .limit(1);
  if (conflict) {
    return { ok: false, error: 'Bed is occupied by another booking for that date range.' };
  }

  await db.execute(
    unboundedUpper
      ? sql`
    UPDATE bed_reservations
    SET
      stay_range = daterange(${moveInDate}::date, NULL, '[)'),
      updated_at = now()
    WHERE booking_id = ${input.bookingId}
      AND status = 'active'
  `
      : sql`
    UPDATE bed_reservations
    SET
      stay_range = daterange(${moveInDate}::date, ${stayEnd}::date, '[)'),
      updated_at = now()
    WHERE booking_id = ${input.bookingId}
      AND status = 'active'
  `,
  );

  const rentResult = await recalculateRentAfterMoveInChange({
    bookingId: input.bookingId,
    adminId: session.adminId,
  });

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: session.adminId,
    entity: 'booking',
    entityId: input.bookingId,
    action: 'move_in_updated',
    diff: {
      customerId: ctx.customerId,
      pgId: ctx.pgId,
      fromMoveInDate: ctx.currentStart,
      toMoveInDate: moveInDate,
      invoicesUpdated: rentResult.updatedCount,
      billingDay: rentResult.billingDay,
    },
  });

  const { reconcileBookingOccupancy } = await import('@/src/lib/occupancySync');
  await reconcileBookingOccupancy(input.bookingId);

  return {
    ok: true,
    invoicesUpdated: rentResult.updatedCount,
    billingDay: rentResult.billingDay,
  };
}

/** Override next rent due date — updates billing day and earliest open invoice with audit. */
export async function updateRentDueDateOverride(
  session: AdminSession,
  input: { bookingId: string; nextDueDate: string; reason: string },
): Promise<{ ok: true; billingDay: number } | { ok: false; error: string }> {
  const nextDueDate = formatDate(parseDate(input.nextDueDate));
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: 'Reason is required.' };

  const billingDay = billingDayFromMoveIn(nextDueDate);

  const [ctx] = await db
    .select({
      pgId: pgs.id,
      customerId: bookings.customerId,
    })
    .from(bookings)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        eq(bookings.id, input.bookingId),
        eq(bedReservations.kind, 'primary'),
        eq(bedReservations.status, 'active'),
      ),
    )
    .limit(1);

  if (!ctx) return { ok: false, error: 'Booking not found.' };
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, ctx.pgId)) {
    return { ok: false, error: 'Access denied.' };
  }

  const { ensureBillingProfileForBooking } = await import('@/src/services/residentBillingProfiles');
  await ensureBillingProfileForBooking(input.bookingId);

  await db
    .update(residentBillingProfiles)
    .set({ billingDay, updatedAt: new Date() })
    .where(eq(residentBillingProfiles.bookingId, input.bookingId));

  const [openInv] = await db
    .select({ id: rentInvoices.id, dueDate: rentInvoices.dueDate })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, input.bookingId),
        eq(rentInvoices.isAdhoc, false),
        inArray(rentInvoices.status, ['pending', 'overdue']),
      ),
    )
    .orderBy(rentInvoices.dueDate)
    .limit(1);

  if (openInv && openInv.dueDate !== nextDueDate) {
    await db
      .update(rentInvoices)
      .set({ dueDate: nextDueDate, updatedAt: new Date() })
      .where(eq(rentInvoices.id, openInv.id));
  }

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: session.adminId,
    entity: 'booking',
    entityId: input.bookingId,
    action: 'rent_due_date_overridden',
    diff: {
      customerId: ctx.customerId,
      nextDueDate,
      billingDay,
      priorDueDate: openInv?.dueDate ?? null,
      invoiceId: openInv?.id ?? null,
      reason,
    },
  });

  return { ok: true, billingDay };
}

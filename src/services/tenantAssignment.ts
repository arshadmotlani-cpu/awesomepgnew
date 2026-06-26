import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedPrices, bedReservations, beds, bookings, customers, floors, pgs, rooms } from '@/src/db/schema';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { formatDate } from '@/src/lib/dates';
import { quoteMonthlyBedDepositPaise } from '@/src/lib/booking/publicQuote';
import { getActiveTenancyForCustomer } from '@/src/lib/residentActiveTenancy';
import { getCustomerVerificationStatus } from '@/src/services/residentAdmin';
import { createBooking } from '@/src/services/booking';
import { clearBedAdminMarks } from '@/src/services/bookingAdminOps';
import { reconcileOrphanBedReservations } from '@/src/lib/occupancySync';
import { isBedAvailable } from '@/src/services/availability';
import { validateResidentGenderForBed } from '@/src/services/pgGenderPolicy';

const LONG_TERM_RESERVATION_END = '2099-01-01';

export type AssignTenantInput = {
  bedId: string;
  startDate: string;
  customerId?: string;
  fullName: string;
  email: string;
  phone: string;
  gender: 'male' | 'female' | 'other';
  blocksWholeRoom?: boolean;
  notes?: string;
};

export async function assignTenantToBed(
  session: AdminSession,
  input: AssignTenantInput,
): Promise<
  | { ok: true; bookingId: string; bookingCode: string }
  | { ok: false; error: string }
> {
  const [bedCtx] = await db
    .select({
      bedId: beds.id,
      bedCode: beds.bedCode,
      roomNumber: rooms.roomNumber,
      pgId: pgs.id,
      pgName: pgs.name,
    })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(and(eq(beds.id, input.bedId), isNull(beds.archivedAt), isNull(pgs.archivedAt)))
    .limit(1);

  if (!bedCtx) return { ok: false, error: 'Bed not found.' };
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, bedCtx.pgId)) {
    return { ok: false, error: 'You do not have access to this PG.' };
  }

  // Admin assignment replaces any manual occupied/reserved marks on the bed.
  await clearBedAdminMarks(input.bedId);
  await reconcileOrphanBedReservations(input.bedId);

  const available = await isBedAvailable({
    bedId: input.bedId,
    startDate: input.startDate,
    endDate: LONG_TERM_RESERVATION_END,
  });
  if (!available) {
    return { ok: false, error: 'That bed is already booked for the selected dates.' };
  }

  const genderCheck = await validateResidentGenderForBed(input.bedId, input.gender);
  if (!genderCheck.ok) {
    return { ok: false, error: genderCheck.error };
  }

  if (input.customerId) {
    const verification = await getCustomerVerificationStatus(input.customerId);
    if (!verification) {
      return { ok: false, error: 'Customer account not found.' };
    }
    if (!verification.isVerified) {
      return {
        ok: false,
        error:
          'This person is not verified yet. Approve their KYC or a payment first — they appear under Website signups until then.',
      };
    }

    const existing = await getActiveTenancyForCustomer(input.customerId);
    if (existing) {
      return {
        ok: false,
        error: `This resident already occupies ${existing.pgName} · Room ${existing.roomNumber} · ${existing.bedCode}. Open their profile to manage the tenancy.`,
      };
    }
  }

  const result = await createBooking({
    bedIds: [input.bedId],
    startDate: input.startDate,
    endDate: null,
    durationMode: 'open_ended',
    reservationEndDate: LONG_TERM_RESERVATION_END,
    blocksRoomAvailability: input.blocksWholeRoom === true,
    customerId: input.customerId,
    customer: {
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      gender: input.gender,
    },
    notes:
      input.notes?.trim() ||
      (input.blocksWholeRoom
        ? `Whole-room occupancy — Room ${bedCtx.roomNumber} ${bedCtx.pgName}`
        : undefined),
    createdVia: 'admin',
    createdByAdminId: session.adminId,
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  await db
    .update(customers)
    .set({ residencyStatus: 'active', updatedAt: new Date() })
    .where(eq(customers.id, result.customerId));

  const { clearBedInterest } = await import('./bedNoticeInterest');
  await clearBedInterest(input.bedId).catch(() => undefined);

  const { reconcileBookingOccupancy } = await import('@/src/lib/occupancySync');
  await reconcileBookingOccupancy(result.bookingId);

  const { ensureBillingProfileForBooking } = await import('@/src/services/residentBillingProfiles');
  await ensureBillingProfileForBooking(result.bookingId).catch(() => undefined);

  try {
    const { ensureContinuousResidencyOnBookingConfirmed } = await import(
      '@/src/services/continuousResidency'
    );
    await ensureContinuousResidencyOnBookingConfirmed(result.bookingId);
  } catch (residencyErr) {
    console.error('continuous residency on tenant assign failed:', residencyErr);
  }

  return { ok: true, bookingId: result.bookingId, bookingCode: result.bookingCode };
}

export async function listAssignableBeds(session: AdminSession, startDate?: string) {
  const from = startDate ?? formatDate(new Date());
  const rows = await db
    .select({
      bedId: beds.id,
      bedCode: beds.bedCode,
      manualOccupied: beds.manualOccupied,
      roomNumber: rooms.roomNumber,
      pgId: pgs.id,
      pgName: pgs.name,
      monthlyRatePaise: sql<number>`coalesce((
        SELECT bp.monthly_rate_paise::bigint::int FROM ${bedPrices} bp
        WHERE bp.bed_id = ${beds.id}
          AND bp.effective_from <= CURRENT_DATE
          AND (bp.effective_to IS NULL OR bp.effective_to > CURRENT_DATE)
        ORDER BY bp.effective_from DESC LIMIT 1
      ), 0)`,
      dailyRatePaise: sql<number>`coalesce((
        SELECT bp.daily_rate_paise::bigint::int FROM ${bedPrices} bp
        WHERE bp.bed_id = ${beds.id}
          AND bp.effective_from <= CURRENT_DATE
          AND (bp.effective_to IS NULL OR bp.effective_to > CURRENT_DATE)
        ORDER BY bp.effective_from DESC LIMIT 1
      ), 0)`,
    })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(and(isNull(beds.archivedAt), isNull(pgs.archivedAt)))
    .orderBy(asc(pgs.name), asc(rooms.roomNumber), asc(beds.bedCode));

  const allowed = rows.filter((row) =>
    adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pgId),
  );

  const available: Array<(typeof allowed)[number] & { depositPaise: number }> = [];
  for (const row of allowed) {
    const ok = await isBedAvailable(
      {
        bedId: row.bedId,
        startDate: from,
        endDate: LONG_TERM_RESERVATION_END,
      },
      { ignoreManualOccupied: true },
    );
    if (!ok) continue;

    let depositPaise = 0;
    try {
      depositPaise = await quoteMonthlyBedDepositPaise(row.bedId, from);
    } catch {
      depositPaise = 0;
    }
    available.push({ ...row, depositPaise });
  }
  return available;
}

export function defaultTenantStartDate(): string {
  const now = new Date();
  return formatDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
}

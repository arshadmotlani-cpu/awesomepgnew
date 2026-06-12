import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedPrices, bedReservations, beds, bookings, floors, pgs, rooms } from '@/src/db/schema';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { formatDate } from '@/src/lib/dates';
import { recordDepositCollected } from '@/src/services/deposits';
import { createBooking } from '@/src/services/booking';
import { clearBedAdminMarks } from '@/src/services/bookingAdminOps';
import { isBedAvailable } from '@/src/services/availability';

const LONG_TERM_RESERVATION_END = '2099-01-01';

export type AssignTenantInput = {
  bedId: string;
  startDate: string;
  customerId?: string;
  fullName: string;
  email: string;
  phone: string;
  gender: 'male' | 'female' | 'other';
  monthlyRentInr?: number;
  depositInr?: number;
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

  const available = await isBedAvailable({
    bedId: input.bedId,
    startDate: input.startDate,
    endDate: LONG_TERM_RESERVATION_END,
  });
  if (!available) {
    return { ok: false, error: 'That bed is already booked for the selected dates.' };
  }

  if (input.customerId) {
    const [existing] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
      .where(
        and(
          eq(bookings.customerId, input.customerId),
          eq(bookings.status, 'confirmed'),
          eq(bedReservations.status, 'active'),
          sql`CURRENT_DATE <@ ${bedReservations.stayRange}`,
        ),
      )
      .limit(1);
    if (existing) {
      return { ok: false, error: 'This tenant already has an active bed assignment.' };
    }
  }

  const customMonthlyRatePaise =
    input.monthlyRentInr != null && input.monthlyRentInr >= 0
      ? Math.round(input.monthlyRentInr * 100)
      : undefined;
  const customDepositPaise =
    input.depositInr != null && input.depositInr >= 0
      ? Math.round(input.depositInr * 100)
      : undefined;

  const result = await createBooking({
    bedIds: [input.bedId],
    startDate: input.startDate,
    endDate: null,
    durationMode: 'open_ended',
    reservationEndDate: LONG_TERM_RESERVATION_END,
    blocksRoomAvailability: input.blocksWholeRoom === true,
    customMonthlyRatePaise,
    customDepositPaise,
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

  if (result.depositPaise > 0) {
    await recordDepositCollected({
      bookingId: result.bookingId,
      customerId: result.customerId,
      amountPaise: result.depositPaise,
      reason: customDepositPaise != null
        ? `Deposit recorded on tenant assignment (${bedCtx.bedCode}) — grandfathered amount`
        : `Deposit recorded on tenant assignment (${bedCtx.bedCode})`,
      createdByAdminId: session.adminId,
    }).catch(() => {
      /* non-fatal if duplicate */
    });
  }

  return { ok: true, bookingId: result.bookingId, bookingCode: result.bookingCode };
}

export async function listAssignableBeds(session: AdminSession, startDate?: string) {
  const from = startDate ?? formatDate(new Date());
  const rows = await db
    .select({
      bedId: beds.id,
      bedCode: beds.bedCode,
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
      depositPaise: sql<number>`coalesce((
        SELECT coalesce(
          nullif(bp.monthly_security_deposit_paise, 0),
          bp.security_deposit_paise
        )::bigint::int FROM ${bedPrices} bp
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

  const available: typeof allowed = [];
  for (const row of allowed) {
    const ok = await isBedAvailable({
      bedId: row.bedId,
      startDate: from,
      endDate: LONG_TERM_RESERVATION_END,
    });
    if (ok) available.push(row);
  }
  return available;
}

export function defaultTenantStartDate(): string {
  const now = new Date();
  return formatDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
}

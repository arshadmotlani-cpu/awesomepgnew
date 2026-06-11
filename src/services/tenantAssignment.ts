import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { beds, floors, pgs, rooms } from '@/src/db/schema';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { formatDate } from '@/src/lib/dates';
import { recordDepositCollected } from '@/src/services/deposits';
import { createBooking } from '@/src/services/booking';

const LONG_TERM_RESERVATION_END = '2099-01-01';

export type AssignTenantInput = {
  bedId: string;
  startDate: string;
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

  if (customDepositPaise && customDepositPaise > 0) {
    await recordDepositCollected({
      bookingId: result.bookingId,
      customerId: result.customerId,
      amountPaise: customDepositPaise,
      reason: `Deposit recorded on tenant assignment (${bedCtx.bedCode})`,
      createdByAdminId: session.adminId,
    }).catch(() => {
      /* non-fatal if duplicate */
    });
  }

  return { ok: true, bookingId: result.bookingId, bookingCode: result.bookingCode };
}

export async function listAssignableBeds(session: AdminSession) {
  const rows = await db
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
    .where(and(isNull(beds.archivedAt), isNull(pgs.archivedAt)))
    .orderBy(asc(pgs.name), asc(rooms.roomNumber), asc(beds.bedCode));

  return rows.filter((row) =>
    adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pgId),
  );
}

export function defaultTenantStartDate(): string {
  return formatDate(new Date());
}

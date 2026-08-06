/**
 * Resident Exit Brain — activation (Engine write on vacating approval).
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  bookings,
  beds,
  rentInvoices,
  residentExitBrain,
  rooms,
} from '@/src/db/schema';
import type { FrozenRentLateFeesJson, ResidentExitBrainRow } from '@/src/db/schema/residentExitBrain';
import { formatDate } from '@/src/lib/dates';
import { projectInvoice } from '@/src/services/rentInvoices';

async function resolveRoomIdForBooking(bookingId: string): Promise<string | null> {
  const [row] = await db
    .select({ roomId: rooms.id })
    .from(bookings)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return row?.roomId ?? null;
}

async function snapshotFrozenRentLateFees(
  bookingId: string,
  asOf: string,
): Promise<{ totalPaise: number; byInvoiceId: FrozenRentLateFeesJson }> {
  const invoices = await db
    .select()
    .from(rentInvoices)
    .where(eq(rentInvoices.bookingId, bookingId));

  const byInvoiceId: FrozenRentLateFeesJson = {};
  let totalPaise = 0;

  for (const inv of invoices) {
    if (inv.status === 'paid' || inv.status === 'cancelled') continue;
    const projected = projectInvoice(inv, asOf, { bypassProofSnapshot: true });
    const frozen = projected.accruedLateFeePaise;
    if (frozen > 0) {
      byInvoiceId[inv.id] = frozen;
      totalPaise += frozen;
    }
  }

  return { totalPaise, byInvoiceId };
}

export async function activateResidentExitBrain(input: {
  vacatingRequestId: string;
  bookingId: string;
  customerId: string;
  noticeGivenDate: string;
  expectedCheckoutDate: string;
  frozenNoticePenaltyPaise: number;
  activatedAt?: Date;
}): Promise<ResidentExitBrainRow> {
  const roomId = await resolveRoomIdForBooking(input.bookingId);
  if (!roomId) {
    throw new Error(`Cannot activate Exit Brain — room not found for booking ${input.bookingId}`);
  }

  const activatedAt = input.activatedAt ?? new Date();
  const asOf = formatDate(activatedAt);
  const { totalPaise, byInvoiceId } = await snapshotFrozenRentLateFees(input.bookingId, asOf);

  const [existing] = await db
    .select()
    .from(residentExitBrain)
    .where(eq(residentExitBrain.bookingId, input.bookingId))
    .limit(1);

  if (existing?.status === 'active') {
    const [updated] = await db
      .update(residentExitBrain)
      .set({
        vacatingRequestId: input.vacatingRequestId,
        noticeGivenDate: input.noticeGivenDate,
        expectedCheckoutDate: input.expectedCheckoutDate,
        frozenNoticePenaltyPaise: input.frozenNoticePenaltyPaise,
        frozenRentLateFeePaise: totalPaise,
        frozenRentLateFeesJson: byInvoiceId,
        updatedAt: new Date(),
      })
      .where(eq(residentExitBrain.id, existing.id))
      .returning();
    return updated!;
  }

  const [row] = await db
    .insert(residentExitBrain)
    .values({
      bookingId: input.bookingId,
      vacatingRequestId: input.vacatingRequestId,
      customerId: input.customerId,
      roomId,
      status: 'active',
      activatedAt,
      noticeGivenDate: input.noticeGivenDate,
      expectedCheckoutDate: input.expectedCheckoutDate,
      frozenNoticePenaltyPaise: input.frozenNoticePenaltyPaise,
      frozenRentLateFeePaise: totalPaise,
      frozenRentLateFeesJson: byInvoiceId,
    })
    .returning();

  return row!;
}

export async function completeResidentExitBrain(bookingId: string): Promise<void> {
  await db
    .update(residentExitBrain)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(eq(residentExitBrain.bookingId, bookingId));
}

/** Deactivate exit mode when approved vacating is cancelled before settlement starts. */
export async function deactivateResidentExitBrain(bookingId: string): Promise<void> {
  await db
    .update(residentExitBrain)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(
      and(eq(residentExitBrain.bookingId, bookingId), eq(residentExitBrain.status, 'active')),
    );
}

export async function getExitBrainForBooking(
  bookingId: string,
): Promise<ResidentExitBrainRow | null> {
  const [row] = await db
    .select()
    .from(residentExitBrain)
    .where(eq(residentExitBrain.bookingId, bookingId))
    .limit(1);
  return row ?? null;
}

export async function getActiveExitBrainForBooking(
  bookingId: string,
): Promise<ResidentExitBrainRow | null> {
  const [row] = await db
    .select()
    .from(residentExitBrain)
    .where(eq(residentExitBrain.bookingId, bookingId))
    .limit(1);
  if (!row || row.status !== 'active') return null;
  return row;
}

export async function getExitBrainFrozenRentLateFeeMap(
  bookingId: string,
): Promise<Map<string, number> | null> {
  const row = await getActiveExitBrainForBooking(bookingId);
  if (!row) return null;
  return new Map(Object.entries(row.frozenRentLateFeesJson ?? {}));
}

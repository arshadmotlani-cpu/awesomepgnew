'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { assertAdminBookingAccess } from '@/src/lib/auth/pgAccess';
import { revalidateOccupancyViews } from '@/src/lib/occupancyRevalidate';
import {
  revalidateVacatingLifecycleForBooking,
  revalidateVacatingLifecycleViews,
} from '@/src/lib/vacating/revalidateVacatingViews';
import {
  activateReservationNow,
  shiftBookingToReservation,
} from '@/src/services/residentAdmin';
import { submitVacatingRequest } from '@/src/services/vacating';

export type MapActionState = { ok: boolean; error?: string };

export async function submitAdminVacatingAction(
  _prev: MapActionState,
  formData: FormData,
): Promise<MapActionState> {
  try {
    const admin = await requireAdminPermission('vacating:write');
    const bookingId = String(formData.get('bookingId') ?? '');
    const pgId = String(formData.get('pgId') ?? '');
    const vacatingDate = String(formData.get('vacatingDate') ?? '');
    const notes = String(formData.get('notes') ?? '');
    const waiveDeduction = formData.get('waiveDeduction') === 'on';
    const openBedForBooking = formData.get('openBedForBooking') === 'on';

    if (!/^\d{4}-\d{2}-\d{2}$/.test(vacatingDate)) {
      return { ok: false, error: 'Vacating date must be YYYY-MM-DD.' };
    }

    if (!/^[0-9a-f-]{36}$/i.test(bookingId)) {
      return { ok: false, error: 'Invalid booking.' };
    }

    await assertAdminBookingAccess(admin, bookingId);

    const result = await submitVacatingRequest({
      bookingId,
      vacatingDate,
      notes: notes || null,
      waiveDeduction,
      openBedForBookingFromVacatingDate: openBedForBooking,
      resolvedByAdminId: admin.adminId,
    });

    if (!result.ok) {
      if (result.kind === 'already_exists') {
        return { ok: false, error: 'A vacating request already exists for this booking.' };
      }
      if (result.kind === 'invalid_input') return { ok: false, error: result.message };
      return { ok: false, error: `Could not submit (${result.kind}).` };
    }

    revalidateOccupancyViews(pgId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function shiftToReservationAction(
  _prev: MapActionState,
  formData: FormData,
): Promise<MapActionState> {
  try {
    const session = await requireAdminPermission('bookings:write');
    const bookingId = String(formData.get('bookingId') ?? '');
    const pgId = String(formData.get('pgId') ?? '');
    const moveInDate = String(formData.get('moveInDate') ?? '');

    const result = await shiftBookingToReservation(session, { bookingId, moveInDate });
    if (!result.ok) return result;

    revalidateOccupancyViews(pgId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function activateReservationAction(
  _prev: MapActionState,
  formData: FormData,
): Promise<MapActionState> {
  try {
    const session = await requireAdminPermission('bookings:write');
    const bookingId = String(formData.get('bookingId') ?? '');
    const pgId = String(formData.get('pgId') ?? '');

    const result = await activateReservationNow(session, { bookingId });
    if (!result.ok) return result;

    revalidateOccupancyViews(pgId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function setBedManualOccupiedAction(
  bedId: string,
  pgId: string,
  occupied: boolean,
): Promise<MapActionState> {
  try {
    const session = await requireAdminPermission('bookings:write');
    const { setBedManualOccupied } = await import('@/src/services/bookingAdminOps');
    const result = await setBedManualOccupied(session, bedId, occupied);
    if (!result.ok) return result;

    revalidateOccupancyViews(pgId);
    revalidatePath('/pgs');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function setBedManualReservedAction(
  bedId: string,
  pgId: string,
  checkInDate: string,
  reserveStart?: string,
): Promise<MapActionState> {
  try {
    const session = await requireAdminPermission('bookings:write');
    const { setBedManualReserved } = await import('@/src/services/bookingAdminOps');
    const result = await setBedManualReserved(session, bedId, checkInDate, reserveStart);
    if (!result.ok) return result;

    revalidateOccupancyViews(pgId);
    revalidatePath('/pgs');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function clearBedManualReservedAction(
  bedId: string,
  pgId: string,
): Promise<MapActionState> {
  try {
    const session = await requireAdminPermission('bookings:write');
    const { clearBedManualReserved } = await import('@/src/services/bookingAdminOps');
    const result = await clearBedManualReserved(session, bedId);
    if (!result.ok) return result;

    revalidateOccupancyViews(pgId);
    revalidatePath('/pgs');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function removeTenantFromBedAction(
  _prev: MapActionState,
  formData: FormData,
): Promise<MapActionState> {
  try {
    const session = await requireAdminPermission('bookings:write');
    const bookingId = String(formData.get('bookingId') ?? '');
    const pgId = String(formData.get('pgId') ?? '');
    const reason = String(formData.get('reason') ?? '').trim();

    if (!/^[0-9a-f-]{36}$/i.test(bookingId)) {
      return { ok: false, error: 'Invalid booking.' };
    }

    await assertAdminBookingAccess(session, bookingId);

    const { adminRemoveTenantFromBed } = await import('@/src/services/vacating');
    const result = await adminRemoveTenantFromBed({
      bookingId,
      resolvedByAdminId: session.adminId,
      reason: reason || undefined,
    });
    if (!result.ok) return result;

    await revalidateVacatingLifecycleForBooking(bookingId);
    if (pgId) revalidateVacatingLifecycleViews({ pgId });
    revalidateOccupancyViews(pgId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

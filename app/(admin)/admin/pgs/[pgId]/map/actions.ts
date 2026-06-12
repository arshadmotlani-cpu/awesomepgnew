'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
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

    revalidatePath('/admin/vacating');
    revalidatePath('/admin/pgs');
    if (pgId) revalidatePath(`/admin/pgs/${pgId}/map`);
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

    revalidatePath('/admin/residents');
    revalidatePath('/admin/bookings');
    if (pgId) revalidatePath(`/admin/pgs/${pgId}/map`);
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

    revalidatePath('/admin/residents');
    revalidatePath('/admin/bookings');
    if (pgId) revalidatePath(`/admin/pgs/${pgId}/map`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

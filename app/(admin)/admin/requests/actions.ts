'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { assertAdminResidentRequestAccess } from '@/src/lib/auth/pgAccess';
import { assertAdminBookingAccess } from '@/src/lib/auth/pgAccess';
import { adminReviewResidentRequest } from '@/src/services/residentRequests';
import { calculateRefundElectricityForBooking } from '@/src/services/refundElectricity';
import { syncActionItems } from '@/src/services/actionItems';

export type ReviewRequestState = { ok: boolean; error?: string };

function parseIntField(formData: FormData, key: string): number | undefined {
  const raw = formData.get(key)?.toString();
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

export async function reviewResidentRequestAction(
  _prev: ReviewRequestState,
  formData: FormData,
): Promise<ReviewRequestState> {
  const session = await requireAdminPermission('bookings:write');
  const requestId = formData.get('requestId')?.toString() ?? '';
  const action = formData.get('action')?.toString() as
    | 'under_review'
    | 'approve'
    | 'reject'
    | 'complete'
    | undefined;
  const adminNotes = formData.get('adminNotes')?.toString()?.trim();

  if (!requestId || !action) return { ok: false, error: 'Invalid request.' };

  try {
    await assertAdminResidentRequestAccess(session, requestId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Access denied for this PG.',
    };
  }

  const refundCompletion =
    action === 'complete'
      ? {
          electricityUnitCostPaise: parseIntField(formData, 'electricityUnitCostPaise'),
          electricityUnits: parseIntField(formData, 'electricityUnits'),
          damageChargePaise: parseIntField(formData, 'damageChargePaise'),
          cleaningChargePaise: parseIntField(formData, 'cleaningChargePaise'),
          penaltyChargePaise: parseIntField(formData, 'penaltyChargePaise'),
          customChargePaise: parseIntField(formData, 'customChargePaise'),
          customChargeLabel: formData.get('customChargeLabel')?.toString()?.trim() || undefined,
          refundMethod: formData.get('refundMethod')?.toString()?.trim() || undefined,
        }
      : undefined;

  const result = await adminReviewResidentRequest({
    requestId,
    adminId: session.adminId,
    action,
    adminNotes: adminNotes || undefined,
    refundCompletion,
  });

  if (!result.ok) return { ok: false, error: result.error };

  await syncActionItems(session).catch(() => undefined);
  revalidatePath('/admin/requests');
  revalidatePath('/admin/overview');
  revalidatePath('/admin/deposits');
  redirect('/admin/requests?reviewed=1');
}

export type RefundElectricityActionState =
  | { ok: false; error: string }
  | {
      ok: true;
      units: number;
      ratePerUnitPaise: number;
      amountPaise: number;
      message: string;
    };

export async function calculateRefundElectricityAction(
  _prev: RefundElectricityActionState | null,
  formData: FormData,
): Promise<RefundElectricityActionState> {
  const session = await requireAdminPermission('bookings:write');
  const bookingId = formData.get('bookingId')?.toString() ?? '';
  const useAverageFallback = formData.get('useAverageFallback')?.toString() === '1';

  if (!bookingId) return { ok: false, error: 'Booking required.' };

  try {
    await assertAdminBookingAccess(session, bookingId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Access denied for this PG.',
    };
  }

  const result = await calculateRefundElectricityForBooking(session, {
    bookingId,
    useAverageFallback,
  });

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath('/admin/requests');
  revalidatePath('/admin/electricity');

  return {
    ok: true,
    units: result.units,
    ratePerUnitPaise: result.ratePerUnitPaise,
    amountPaise: result.amountPaise,
    message: result.message,
  };
}

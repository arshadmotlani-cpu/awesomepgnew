'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requirePermission } from '@/src/hair/lib/auth/permissions';
import type { FyhAppointmentStatus } from '@/src/hair/db/schema/appointments';
import { isFyhAppointmentStatus } from '@/src/hair/lib/appointmentStatus';
import {
  createAppointment,
  rescheduleAppointment,
  updateAppointment,
  updateAppointmentNotes,
  updateAppointmentStatus,
} from '@/src/hair/services/appointments';
import { buildBasketFromAppointment } from '@/src/hair/domain/basket/appointmentBridge';
import {
  recordInvoicePayments,
  type PaymentSplitInput,
} from '@/src/hair/services/invoices';
import { getTenantContextForAction } from '@/src/hair/lib/tenant/getTenantContext';

export type ApptActionState = { error?: string; success?: string; id?: string; duePaise?: number };

function formStr(fd: FormData, key: string) {
  return String(fd.get(key) ?? '').trim();
}

export async function createAppointmentAction(
  _prev: ApptActionState,
  formData: FormData,
): Promise<ApptActionState> {
  try {
    const session = await requirePermission('page:appointments');
    const serviceIds = formData.getAll('serviceIds').map(String).filter(Boolean);
    const startLocal = formStr(formData, 'startAt');
    const startAt = new Date(startLocal);
    if (Number.isNaN(startAt.getTime())) return { error: 'Invalid start time' };

    const id = await createAppointment({
      customerId: formStr(formData, 'customerId'),
      staffId: formStr(formData, 'staffId'),
      resourceId: formStr(formData, 'resourceId') || null,
      startAt,
      serviceIds,
      notes: formStr(formData, 'notes') || null,
      source: formStr(formData, 'source') === 'walk_in' ? 'walk_in' : 'booking',
      status: (() => {
        const raw = formStr(formData, 'status');
        return isFyhAppointmentStatus(raw) ? (raw as FyhAppointmentStatus) : undefined;
      })(),
      recurrenceWeeks: Number(formStr(formData, 'recurrenceWeeks') || '1'),
      createdByAdminId: session.id,
    });
    revalidatePath('/appointments');
    revalidatePath('/dashboard/revenue');
    revalidatePath(`/customers/${formStr(formData, 'customerId')}`);
    return { success: 'Appointment created', id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to create appointment' };
  }
}

export async function rescheduleAppointmentAction(input: {
  id: string;
  startAtIso: string;
  endAtIso?: string;
  staffId?: string;
  resourceId?: string | null;
}): Promise<ApptActionState> {
  try {
    await requirePermission('page:appointments');
    await rescheduleAppointment({
      id: input.id,
      startAt: new Date(input.startAtIso),
      endAt: input.endAtIso ? new Date(input.endAtIso) : undefined,
      staffId: input.staffId,
      resourceId: input.resourceId,
    });
    revalidatePath('/appointments');
    revalidatePath('/dashboard/revenue');
    return { success: 'Updated' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to reschedule' };
  }
}

export async function setAppointmentStatusAction(
  id: string,
  status: FyhAppointmentStatus,
): Promise<ApptActionState> {
  try {
    await requirePermission('page:appointments');
    await updateAppointmentStatus(id, status);
    revalidatePath('/appointments');
    revalidatePath('/dashboard/revenue');
    return { success: `Marked ${status}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update status' };
  }
}

export async function saveAppointmentNotesAction(id: string, notes: string): Promise<ApptActionState> {
  try {
    await requirePermission('page:appointments');
    await updateAppointmentNotes(id, notes || null);
    revalidatePath('/appointments');
    return { success: 'Notes saved' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to save notes' };
  }
}

export async function updateAppointmentAction(input: {
  id: string;
  customerId?: string;
  staffId?: string;
  resourceId?: string | null;
  startAtIso?: string;
  endAtIso?: string;
  serviceIds?: string[];
  notes?: string;
  status?: FyhAppointmentStatus;
}): Promise<ApptActionState> {
  try {
    await requirePermission('page:appointments');
    await updateAppointment({
      id: input.id,
      customerId: input.customerId,
      staffId: input.staffId,
      resourceId: input.resourceId,
      startAt: input.startAtIso ? new Date(input.startAtIso) : undefined,
      endAt: input.endAtIso ? new Date(input.endAtIso) : undefined,
      serviceIds: input.serviceIds,
      notes: input.notes,
      status: input.status,
    });
    revalidatePath('/appointments');
    revalidatePath('/dashboard/revenue');
    return { success: 'Appointment updated' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update appointment' };
  }
}

export async function checkoutAppointmentAction(
  appointmentId: string,
): Promise<ApptActionState> {
  try {
    await requirePermission('action:billing.checkout');
    await buildBasketFromAppointment(appointmentId);
    redirect(`/quick-sale?appointmentId=${encodeURIComponent(appointmentId)}`);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Checkout failed' };
  }
}

export async function payInvoiceAction(
  invoiceId: string,
  payments: PaymentSplitInput[],
): Promise<ApptActionState> {
  try {
    const session = await requirePermission('action:billing.checkout');
    const ctx = await getTenantContextForAction();
    await recordInvoicePayments(invoiceId, payments, session.id, ctx);
    revalidatePath('/billing');
    revalidatePath('/appointments');
    revalidatePath('/dashboard/revenue');
    revalidatePath('/inventory');
    revalidatePath('/reports');
    revalidatePath('/staff');
    return { success: 'Payment recorded' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Payment failed' };
  }
}

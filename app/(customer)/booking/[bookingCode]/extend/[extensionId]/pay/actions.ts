'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { stayExtensions } from '@/src/db/schema';
import { getExtensionDetail } from '@/src/db/queries/customer';
import { cancelPendingExtension } from '@/src/services/extension';
import { getCustomerSession } from '@/src/lib/auth/session';
import { requireCustomerOwnsBookingCode } from '@/src/lib/auth/guards';

async function loadExtension(extensionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(extensionId)) return null;
  const result = await getExtensionDetail(extensionId);
  if (!result.ok || !result.data) return null;
  return result.data;
}

export type CancelExtensionActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string };

/** Cancel a still-pending extension before payment (session-gated). */
export async function cancelPendingExtensionAction(
  _prev: CancelExtensionActionState,
  formData: FormData,
): Promise<CancelExtensionActionState> {
  const extensionId = String(formData.get('extensionId') ?? '');
  const ext = await loadExtension(extensionId);
  if (!ext) return { status: 'error', message: 'Extension not found.' };

  const session = await getCustomerSession();
  if (!session) return { status: 'error', message: 'Sign in to cancel this extension.' };
  try {
    await requireCustomerOwnsBookingCode(session, ext.bookingCode);
  } catch {
    return { status: 'error', message: 'Booking not found or access denied.' };
  }

  const result = await cancelPendingExtension({
    extensionId,
    actor: { kind: 'customer', customerId: session.customerId },
    reason: 'customer cancelled before payment',
  });
  if (!result.ok) {
    return { status: 'error', message: result.message };
  }

  await db
    .update(stayExtensions)
    .set({ updatedAt: new Date() })
    .where(eq(stayExtensions.id, extensionId));

  revalidatePath('/admin');
  revalidatePath('/admin/bookings');
  revalidatePath('/admin/extensions');
  revalidatePath(`/booking/${ext.bookingCode}`);
  revalidatePath('/account/bookings');
  redirect(`/booking/${ext.bookingCode}`);
}

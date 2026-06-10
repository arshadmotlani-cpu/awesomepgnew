'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { stayExtensions } from '@/src/db/schema';
import { getExtensionDetail } from '@/src/db/queries/customer';
import { mockProvider, razorpayProvider } from '@/src/services/payments';
import { cancelPendingExtension } from '@/src/services/extension';
import { env } from '@/src/lib/env';
import { razorpayConfigError } from '@/src/lib/payments/config';
import { getCustomerSession } from '@/src/lib/auth/session';
import { requireCustomerOwnsBookingCode } from '@/src/lib/auth/guards';

export type ExtensionPayActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | {
      status: 'razorpay_ready';
      keyId: string;
      providerOrderId: string;
      amountPaise: number;
      extensionId: string;
      bookingCode: string;
      customerName: string;
      customerEmail: string;
      customerPhone: string;
    };

async function loadExtension(extensionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(extensionId)) return null;
  const result = await getExtensionDetail(extensionId);
  if (!result.ok || !result.data) return null;
  return result.data;
}

/**
 * Mock-provider "Simulate payment" for an extension. Mirrors
 * simulateMockPayment (primary) but stamps `purpose: 'extension'` +
 * `extensionId` on the webhook event so the route forks to
 * recordExtensionPaymentSuccess.
 */
async function assertSessionOwnsExtension(ext: {
  bookingCode: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await getCustomerSession();
  if (!session) return { ok: false, message: 'Sign in to pay for this extension.' };
  try {
    await requireCustomerOwnsBookingCode(session, ext.bookingCode);
    return { ok: true };
  } catch {
    return { ok: false, message: 'Booking not found or access denied.' };
  }
}

export async function simulateMockExtensionPayment(
  _prev: ExtensionPayActionState,
  formData: FormData,
): Promise<ExtensionPayActionState> {
  if (env.PAYMENT_PROVIDER !== 'mock') {
    return {
      status: 'error',
      message: 'Online payment is temporarily unavailable. Please try again.',
    };
  }
  const extensionId = String(formData.get('extensionId') ?? '');
  const ext = await loadExtension(extensionId);
  if (!ext) return { status: 'error', message: 'Extension not found.' };
  const own = await assertSessionOwnsExtension(ext);
  if (!own.ok) return { status: 'error', message: own.message };
  if (ext.status !== 'pending') {
    // Already paid / cancelled — bounce to the parent booking page.
    redirect(`/booking/${ext.bookingCode}`);
  }

  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3000';
  const order = await mockProvider.createOrder({
    bookingId: ext.bookingId,
    bookingCode: ext.bookingCode,
    amountPaise: ext.quotedTotalPaise,
    notes: { booking_code: ext.bookingCode, kind: 'extension', extension_id: ext.id },
  });

  const event = {
    kind: 'payment_succeeded' as const,
    providerPaymentId: order.providerOrderId.replace('mock_order_', 'mock_pay_ext_'),
    providerOrderId: order.providerOrderId,
    amountPaise: order.amountPaise,
    currency: 'INR',
    receipt: ext.bookingCode,
    purpose: 'extension' as const,
    extensionId: ext.id,
  };
  const res = await fetch(`${proto}://${host}/api/webhooks/mock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    return {
      status: 'error',
      message: 'Payment could not be completed. Please try again.',
    };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/bookings');
  revalidatePath('/admin/extensions');
  revalidatePath('/admin/payments');
  revalidatePath(`/booking/${ext.bookingCode}`);
  revalidatePath('/account/bookings');
  redirect(`/booking/${ext.bookingCode}`);
}

/**
 * Razorpay-provider extension kickoff. Same shape as startRazorpayOrder
 * (primary) but `notes.kind='extension'` + `notes.extension_id=...` so
 * the webhook can resolve the right stay_extensions row.
 */
export async function startRazorpayExtensionOrder(
  _prev: ExtensionPayActionState,
  formData: FormData,
): Promise<ExtensionPayActionState> {
  const configErr = razorpayConfigError();
  if (configErr) {
    return {
      status: 'error',
      message: 'Online payment is temporarily unavailable. Please try again later.',
    };
  }
  const extensionId = String(formData.get('extensionId') ?? '');
  const ext = await loadExtension(extensionId);
  if (!ext) return { status: 'error', message: 'Extension not found.' };
  const own = await assertSessionOwnsExtension(ext);
  if (!own.ok) return { status: 'error', message: own.message };
  if (ext.status !== 'pending') {
    return {
      status: 'error',
      message: `This extension is in status "${ext.status}" and cannot be paid for again.`,
    };
  }

  let order;
  try {
    order = await razorpayProvider.createOrder({
      bookingId: ext.bookingId,
      bookingCode: ext.bookingCode,
      amountPaise: ext.quotedTotalPaise,
      notes: {
        booking_code: ext.bookingCode,
        kind: 'extension',
        extension_id: ext.id,
      },
    });
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Razorpay order creation failed.',
    };
  }
  const keyId = env.RAZORPAY_KEY_ID;
  if (!keyId) {
    return { status: 'error', message: 'RAZORPAY_KEY_ID is not configured.' };
  }
  return {
    status: 'razorpay_ready',
    keyId,
    providerOrderId: order.providerOrderId,
    amountPaise: order.amountPaise,
    extensionId: ext.id,
    bookingCode: ext.bookingCode,
    customerName: ext.customerFullName,
    customerEmail: '',
    customerPhone: ext.customerPhone,
  };
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

  // Defensive: also flip the extension row in case the service didn't (it does).
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

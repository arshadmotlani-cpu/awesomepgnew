'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { getBookingByCode } from '@/src/db/queries/customer';
import { getCustomerSession } from '@/src/lib/auth/session';
import { requireCustomerOwnsBookingCode } from '@/src/lib/auth/guards';
import { mockProvider, razorpayProvider } from '@/src/services/payments';
import { env } from '@/src/lib/env';
import { razorpayConfigError } from '@/src/lib/payments/config';
import { getCustomerById, isProfileComplete } from '@/src/services/profile';

async function assertSessionOwnsBooking(
  bookingCode: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await getCustomerSession();
  if (!session) return { ok: false, message: 'Sign in to pay for this booking.' };
  const customer = await getCustomerById(session.customerId);
  if (!customer || !isProfileComplete(customer)) {
    return {
      ok: false,
      message: 'Complete your profile before payment.',
    };
  }
  try {
    await requireCustomerOwnsBookingCode(session, bookingCode);
    return { ok: true };
  } catch {
    return { ok: false, message: 'Booking not found or access denied.' };
  }
}

function paymentSuccessUrl(bookingCode: string): string {
  return `/booking/${bookingCode}/payment-success`;
}

export type PayActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | {
      status: 'razorpay_ready';
      keyId: string;
      providerOrderId: string;
      amountPaise: number;
      bookingCode: string;
      customerName: string;
      customerEmail: string;
      customerPhone: string;
    };

/**
 * Mock-provider one-button pay. Posts a hand-built `payment_succeeded`
 * event to the mock webhook, which runs through the exact same
 * `recordPaymentSuccess()` codepath as a real Razorpay webhook. On success
 * we revalidate the admin caches and bounce to the confirmation page.
 */
export async function simulateMockPayment(
  _prev: PayActionState,
  formData: FormData,
): Promise<PayActionState> {
  if (env.PAYMENT_PROVIDER !== 'mock') {
    return {
      status: 'error',
      message: 'Online payment is temporarily unavailable. Please try again.',
    };
  }
  const bookingCode = String(formData.get('bookingCode') ?? '');
  if (!/^APG-\d{4}-\d+$/.test(bookingCode)) {
    return { status: 'error', message: 'Invalid booking code.' };
  }
  const own = await assertSessionOwnsBooking(bookingCode);
  if (!own.ok) return { status: 'error', message: own.message };

  const result = await getBookingByCode(bookingCode);
  if (!result.ok) return { status: 'error', message: result.error };
  if (!result.data) return { status: 'error', message: 'Booking not found.' };
  if (result.data.status === 'confirmed') {
    redirect(paymentSuccessUrl(bookingCode));
  }
  if (result.data.status !== 'pending_payment') {
    return {
      status: 'error',
      message: `Cannot pay for a booking in status "${result.data.status}".`,
    };
  }

  // Call the mock webhook via an HTTP request so the integration looks
  // identical to a real Razorpay webhook (same route, same parsing). Build
  // the URL from request headers so this works on any port / host.
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3000';
  const order = await mockProvider.createOrder({
    bookingId: result.data.id,
    bookingCode,
    amountPaise: result.data.totalPaise,
  });
  const event = {
    kind: 'payment_succeeded' as const,
    providerPaymentId: order.providerOrderId.replace('mock_order_', 'mock_pay_'),
    providerOrderId: order.providerOrderId,
    amountPaise: order.amountPaise,
    currency: 'INR',
    receipt: bookingCode,
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
  revalidatePath('/admin/payments');
  revalidatePath(`/booking/${bookingCode}`);
  redirect(paymentSuccessUrl(bookingCode));
}

/**
 * Razorpay-provider order kickoff. Creates a Razorpay Order via the REST
 * API and returns the key id + order id so the client SDK can open the
 * checkout overlay. The actual payment capture happens out-of-process and
 * is reported back via /api/webhooks/razorpay.
 */
export async function startRazorpayOrder(
  _prev: PayActionState,
  formData: FormData,
): Promise<PayActionState> {
  const configErr = razorpayConfigError();
  if (configErr) {
    return {
      status: 'error',
      message: 'Online payment is temporarily unavailable. Please try again later.',
    };
  }
  const bookingCode = String(formData.get('bookingCode') ?? '');
  if (!/^APG-\d{4}-\d+$/.test(bookingCode)) {
    return { status: 'error', message: 'Invalid booking code.' };
  }
  const own = await assertSessionOwnsBooking(bookingCode);
  if (!own.ok) return { status: 'error', message: own.message };

  const result = await getBookingByCode(bookingCode);
  if (!result.ok) return { status: 'error', message: result.error };
  if (!result.data) return { status: 'error', message: 'Booking not found.' };
  if (result.data.status !== 'pending_payment') {
    return {
      status: 'error',
      message: `Cannot pay for a booking in status "${result.data.status}".`,
    };
  }

  let order;
  try {
    order = await razorpayProvider.createOrder({
      bookingId: result.data.id,
      bookingCode,
      amountPaise: result.data.totalPaise,
      notes: { booking_code: bookingCode },
    });
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Razorpay order creation failed.',
    };
  }

  const keyId = env.RAZORPAY_KEY_ID;
  if (!keyId) {
    return {
      status: 'error',
      message: 'Payment is temporarily unavailable. Please try again later.',
    };
  }

  return {
    status: 'razorpay_ready',
    keyId,
    providerOrderId: order.providerOrderId,
    amountPaise: order.amountPaise,
    bookingCode,
    customerName: result.data.customer.fullName,
    customerEmail: result.data.customer.email,
    customerPhone: result.data.customer.phone,
  };
}

'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, customers, electricityInvoices, rentInvoices } from '@/src/db/schema';
import { env } from '@/src/lib/env';
import { razorpayConfigError } from '@/src/lib/payments/config';
import { getCustomerSession } from '@/src/lib/auth/session';
import { requireCustomerOwnsBooking } from '@/src/lib/auth/guards';
import {
  mockProvider,
  razorpayProvider,
} from '@/src/services/payments';
import { submitVacatingRequest, cancelVacatingRequestByCustomer } from '@/src/services/vacating';
import { accountProfileHref } from '@/src/lib/accountNavigation';

/**
 * Phase 5.5 — customer/resident server actions.
 *
 *   - simulateMockRentPayment / startRazorpayRentOrder       — pay-rent button
 *   - simulateMockElectricityPayment / startRazorpayElectricityOrder — pay-electricity button
 *   - submitVacatingAction                                    — request vacating form
 *
 * Phone-gated ownership check: every action takes a `phone` hidden field
 * and validates it against `customers.phone` via timingSafeEqual on the
 * normalised values. Matches the customer-cancellation pattern from
 * Phase 4 — same trust model as /account/bookings.
 */

export type ActionState =
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
      purpose: 'rent' | 'electricity';
      invoiceId: string;
    };

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

async function verifySessionOwnership(bookingId: string): Promise<
  | { ok: true; customer: { id: string; fullName: string; email: string; phone: string }; booking: { id: string; bookingCode: string } }
  | { ok: false; message: string }
> {
  const session = await getCustomerSession();
  if (!session) return { ok: false, message: 'Sign in required.' };
  try {
    const booking = await requireCustomerOwnsBooking(session, bookingId);
    return {
      ok: true,
      customer: {
        id: session.customerId,
        fullName: session.fullName,
        email: session.email,
        phone: session.phone,
      },
      booking: { id: booking.bookingId, bookingCode: booking.bookingCode },
    };
  } catch {
    return { ok: false, message: 'Access denied.' };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Rent payment actions
// ───────────────────────────────────────────────────────────────────────────

async function loadRentInvoice(invoiceId: string) {
  const [row] = await db
    .select({
      id: rentInvoices.id,
      bookingId: rentInvoices.bookingId,
      rentPaise: rentInvoices.rentPaise,
      status: rentInvoices.status,
    })
    .from(rentInvoices)
    .where(eq(rentInvoices.id, invoiceId))
    .limit(1);
  return row ?? null;
}

export async function simulateMockRentPayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (env.PAYMENT_PROVIDER !== 'mock') {
    return {
      status: 'error',
      message: 'Online payment is temporarily unavailable. Please try again.',
    };
  }
  const invoiceId = String(formData.get('invoiceId') ?? '');
  if (!invoiceId) return { status: 'error', message: 'Missing invoice id.' };

  const invoice = await loadRentInvoice(invoiceId);
  if (!invoice) return { status: 'error', message: 'Invoice not found.' };

  const ownership = await verifySessionOwnership(invoice.bookingId);
  if (!ownership.ok) return { status: 'error', message: ownership.message };
  if (invoice.status === 'paid') {
    redirect(accountProfileHref('resident'));
  }
  if (invoice.status === 'cancelled') {
    return { status: 'error', message: 'Invoice is cancelled.' };
  }

  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3000';

  // Mock provider needs a "booking code" for receipt; we reuse it as a
  // synthetic id since rent payments don't carry a booking_code anyway.
  const order = await mockProvider.createOrder({
    bookingId: invoice.bookingId,
    bookingCode: `RNT-${invoice.id.slice(0, 8)}`,
    amountPaise: invoice.rentPaise,
  });
  const event = {
    kind: 'payment_succeeded' as const,
    providerPaymentId: order.providerOrderId.replace('mock_order_', 'mock_pay_'),
    providerOrderId: order.providerOrderId,
    amountPaise: invoice.rentPaise,
    currency: 'INR',
    purpose: 'rent' as const,
    rentInvoiceId: invoice.id,
  };
  const res = await fetch(`${proto}://${host}/api/webhooks/mock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    return { status: 'error', message: 'Payment could not be completed. Please try again.' };
  }
  revalidatePath('/account/profile');
  redirect(accountProfileHref('resident'));
}

export async function startRazorpayRentOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const configErr = razorpayConfigError();
  if (configErr) {
    return {
      status: 'error',
      message: 'Online payment is temporarily unavailable. Please try again later.',
    };
  }
  const invoiceId = String(formData.get('invoiceId') ?? '');
  if (!invoiceId) return { status: 'error', message: 'Missing invoice id.' };

  const invoice = await loadRentInvoice(invoiceId);
  if (!invoice) return { status: 'error', message: 'Invoice not found.' };
  const ownership = await verifySessionOwnership(invoice.bookingId);
  if (!ownership.ok) return { status: 'error', message: ownership.message };

  const order = await razorpayProvider.createOrder({
    bookingId: invoice.bookingId,
    bookingCode: ownership.booking.bookingCode,
    amountPaise: invoice.rentPaise,
    notes: { kind: 'rent', rent_invoice_id: invoice.id },
  });
  return {
    status: 'razorpay_ready',
    keyId: env.RAZORPAY_KEY_ID ?? '',
    providerOrderId: order.providerOrderId,
    amountPaise: order.amountPaise,
    bookingCode: ownership.booking.bookingCode,
    customerName: ownership.customer.fullName,
    customerEmail: ownership.customer.email ?? '',
    customerPhone: ownership.customer.phone,
    purpose: 'rent',
    invoiceId: invoice.id,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Electricity payment actions
// ───────────────────────────────────────────────────────────────────────────

async function loadElectricityInvoice(invoiceId: string) {
  const [row] = await db
    .select({
      id: electricityInvoices.id,
      bookingId: electricityInvoices.bookingId,
      amountPaise: electricityInvoices.amountPaise,
      status: electricityInvoices.status,
    })
    .from(electricityInvoices)
    .where(eq(electricityInvoices.id, invoiceId))
    .limit(1);
  return row ?? null;
}

export async function simulateMockElectricityPayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (env.PAYMENT_PROVIDER !== 'mock') {
    return {
      status: 'error',
      message: 'Online payment is temporarily unavailable. Please try again.',
    };
  }
  const invoiceId = String(formData.get('invoiceId') ?? '');
  if (!invoiceId) return { status: 'error', message: 'Missing invoice id.' };
  const invoice = await loadElectricityInvoice(invoiceId);
  if (!invoice) return { status: 'error', message: 'Invoice not found.' };

  const ownership = await verifySessionOwnership(invoice.bookingId);
  if (!ownership.ok) return { status: 'error', message: ownership.message };
  if (invoice.status === 'paid') {
    redirect(accountProfileHref('resident'));
  }
  if (invoice.status === 'cancelled') {
    return { status: 'error', message: 'Invoice is cancelled.' };
  }

  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3000';
  const order = await mockProvider.createOrder({
    bookingId: invoice.bookingId,
    bookingCode: `ELE-${invoice.id.slice(0, 8)}`,
    amountPaise: invoice.amountPaise,
  });
  const event = {
    kind: 'payment_succeeded' as const,
    providerPaymentId: order.providerOrderId.replace('mock_order_', 'mock_pay_'),
    providerOrderId: order.providerOrderId,
    amountPaise: invoice.amountPaise,
    currency: 'INR',
    purpose: 'electricity' as const,
    electricityInvoiceId: invoice.id,
  };
  const res = await fetch(`${proto}://${host}/api/webhooks/mock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    return { status: 'error', message: 'Payment could not be completed. Please try again.' };
  }
  revalidatePath('/account/profile');
  redirect(accountProfileHref('resident'));
}

export async function startRazorpayElectricityOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const configErr = razorpayConfigError();
  if (configErr) {
    return {
      status: 'error',
      message: 'Online payment is temporarily unavailable. Please try again later.',
    };
  }
  const invoiceId = String(formData.get('invoiceId') ?? '');
  if (!invoiceId) return { status: 'error', message: 'Missing invoice id.' };
  const invoice = await loadElectricityInvoice(invoiceId);
  if (!invoice) return { status: 'error', message: 'Invoice not found.' };
  const ownership = await verifySessionOwnership(invoice.bookingId);
  if (!ownership.ok) return { status: 'error', message: ownership.message };

  const order = await razorpayProvider.createOrder({
    bookingId: invoice.bookingId,
    bookingCode: ownership.booking.bookingCode,
    amountPaise: invoice.amountPaise,
    notes: { kind: 'electricity', electricity_invoice_id: invoice.id },
  });
  return {
    status: 'razorpay_ready',
    keyId: env.RAZORPAY_KEY_ID ?? '',
    providerOrderId: order.providerOrderId,
    amountPaise: order.amountPaise,
    bookingCode: ownership.booking.bookingCode,
    customerName: ownership.customer.fullName,
    customerEmail: ownership.customer.email ?? '',
    customerPhone: ownership.customer.phone,
    purpose: 'electricity',
    invoiceId: invoice.id,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Vacating action
// ───────────────────────────────────────────────────────────────────────────

export type VacatingActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'submitted' };

export async function submitVacatingAction(
  _prev: VacatingActionState,
  formData: FormData,
): Promise<VacatingActionState> {
  const bookingId = String(formData.get('bookingId') ?? '');
  const vacatingDate = String(formData.get('vacatingDate') ?? '');
  const notes = String(formData.get('notes') ?? '');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(vacatingDate)) {
    return { status: 'error', message: 'Vacating date must be YYYY-MM-DD.' };
  }

  const ownership = await verifySessionOwnership(bookingId);
  if (!ownership.ok) return { status: 'error', message: ownership.message };

  const result = await submitVacatingRequest({
    bookingId,
    vacatingDate,
    notes: notes || null,
  });
  if (!result.ok) {
    if (result.kind === 'already_exists') {
      return {
        status: 'error',
        message:
          'A vacating request is already on file for this booking. Open your resident area to withdraw it if you submitted by mistake.',
      };
    }
    if (result.kind === 'invalid_input') {
      return { status: 'error', message: result.message };
    }
    return {
      status: 'error',
      message: `Could not submit (${result.kind}).`,
    };
  }
  revalidatePath('/account/profile');
  redirect(accountProfileHref('resident'));
}

export type CancelVacatingActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string };

export async function cancelVacatingAction(
  _prev: CancelVacatingActionState,
  formData: FormData,
): Promise<CancelVacatingActionState> {
  const requestId = String(formData.get('requestId') ?? '');
  const bookingId = String(formData.get('bookingId') ?? '');

  if (!requestId || !bookingId) {
    return { status: 'error', message: 'Missing request details.' };
  }

  const ownership = await verifySessionOwnership(bookingId);
  if (!ownership.ok) return { status: 'error', message: ownership.message };

  const result = await cancelVacatingRequestByCustomer({
    requestId,
    customerId: ownership.customer.id,
  });
  if (!result.ok) {
    if (result.kind === 'forbidden') {
      return { status: 'error', message: 'Access denied.' };
    }
    if (result.kind === 'wrong_status') {
      return {
        status: 'error',
        message:
          result.status === 'approved'
            ? 'Admin already approved this request — contact your PG manager to change plans.'
            : 'This vacating request can no longer be withdrawn.',
      };
    }
    return { status: 'error', message: 'Vacating request not found.' };
  }

  revalidatePath('/account/profile');
  redirect(accountProfileHref('resident'));
}

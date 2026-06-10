import { NextRequest } from 'next/server';
import { getCustomerSession } from '@/src/lib/auth/session';
import { requireCustomerOwnsBookingCode, requireCustomerOwnsBooking } from '@/src/lib/auth/guards';
import { verifyRazorpayCheckoutPayment } from '@/src/services/paymentVerification';
import { db } from '@/src/db/client';
import { electricityInvoices, rentInvoices, stayExtensions } from '@/src/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = {
  purpose?: string;
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
  amount_paise?: number;
  booking_code?: string;
  extension_id?: string;
  rent_invoice_id?: string;
  electricity_invoice_id?: string;
};

export async function POST(req: NextRequest) {
  const session = await getCustomerSession();
  if (!session) {
    return Response.json({ ok: false, reason: 'Sign in required.' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ ok: false, reason: 'Invalid JSON body.' }, { status: 400 });
  }

  const paymentId = body.razorpay_payment_id?.trim();
  const orderId = body.razorpay_order_id?.trim();
  const signature = body.razorpay_signature?.trim();
  const amountPaise = body.amount_paise;

  if (!paymentId || !orderId || !signature || typeof amountPaise !== 'number' || amountPaise <= 0) {
    return Response.json({ ok: false, reason: 'Missing payment fields.' }, { status: 400 });
  }

  const purpose = body.purpose ?? 'booking';

  if (purpose === 'booking') {
    const bookingCode = body.booking_code?.trim();
    if (!bookingCode || !/^APG-\d{4}-\d+$/.test(bookingCode)) {
      return Response.json({ ok: false, reason: 'Invalid booking code.' }, { status: 400 });
    }
    try {
      await requireCustomerOwnsBookingCode(session, bookingCode);
    } catch {
      return Response.json({ ok: false, reason: 'Access denied.' }, { status: 403 });
    }
    const result = await verifyRazorpayCheckoutPayment({
      purpose: 'booking',
      bookingCode,
      razorpayPaymentId: paymentId,
      razorpayOrderId: orderId,
      razorpaySignature: signature,
      amountPaise,
    });
    return Response.json(result, { status: result.ok ? 200 : 400 });
  }

  if (purpose === 'extension') {
    const extensionId = body.extension_id?.trim();
    if (!extensionId) {
      return Response.json({ ok: false, reason: 'Missing extension id.' }, { status: 400 });
    }
    const [ext] = await db
      .select({ bookingId: stayExtensions.bookingId })
      .from(stayExtensions)
      .where(eq(stayExtensions.id, extensionId))
      .limit(1);
    if (!ext) {
      return Response.json({ ok: false, reason: 'Extension not found.' }, { status: 404 });
    }
    try {
      await requireCustomerOwnsBooking(session, ext.bookingId);
    } catch {
      return Response.json({ ok: false, reason: 'Access denied.' }, { status: 403 });
    }
    const result = await verifyRazorpayCheckoutPayment({
      purpose: 'extension',
      extensionId,
      razorpayPaymentId: paymentId,
      razorpayOrderId: orderId,
      razorpaySignature: signature,
      amountPaise,
    });
    return Response.json(result, { status: result.ok ? 200 : 400 });
  }

  if (purpose === 'rent') {
    const invoiceId = body.rent_invoice_id?.trim();
    if (!invoiceId) {
      return Response.json({ ok: false, reason: 'Missing invoice id.' }, { status: 400 });
    }
    const [inv] = await db
      .select({ bookingId: rentInvoices.bookingId })
      .from(rentInvoices)
      .where(eq(rentInvoices.id, invoiceId))
      .limit(1);
    if (!inv) {
      return Response.json({ ok: false, reason: 'Invoice not found.' }, { status: 404 });
    }
    try {
      await requireCustomerOwnsBooking(session, inv.bookingId);
    } catch {
      return Response.json({ ok: false, reason: 'Access denied.' }, { status: 403 });
    }
    const result = await verifyRazorpayCheckoutPayment({
      purpose: 'rent',
      rentInvoiceId: invoiceId,
      razorpayPaymentId: paymentId,
      razorpayOrderId: orderId,
      razorpaySignature: signature,
      amountPaise,
    });
    return Response.json(result, { status: result.ok ? 200 : 400 });
  }

  if (purpose === 'electricity') {
    const invoiceId = body.electricity_invoice_id?.trim();
    if (!invoiceId) {
      return Response.json({ ok: false, reason: 'Missing invoice id.' }, { status: 400 });
    }
    const [inv] = await db
      .select({ bookingId: electricityInvoices.bookingId })
      .from(electricityInvoices)
      .where(eq(electricityInvoices.id, invoiceId))
      .limit(1);
    if (!inv) {
      return Response.json({ ok: false, reason: 'Invoice not found.' }, { status: 404 });
    }
    try {
      await requireCustomerOwnsBooking(session, inv.bookingId);
    } catch {
      return Response.json({ ok: false, reason: 'Access denied.' }, { status: 403 });
    }
    const result = await verifyRazorpayCheckoutPayment({
      purpose: 'electricity',
      electricityInvoiceId: invoiceId,
      razorpayPaymentId: paymentId,
      razorpayOrderId: orderId,
      razorpaySignature: signature,
      amountPaise,
    });
    return Response.json(result, { status: result.ok ? 200 : 400 });
  }

  return Response.json({ ok: false, reason: 'Unknown payment purpose.' }, { status: 400 });
}

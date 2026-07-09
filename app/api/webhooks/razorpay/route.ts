import { NextRequest } from 'next/server';
import { razorpayProvider } from '@/src/services/payments';
import {
  recordExtensionPaymentFailure,
  recordExtensionPaymentSuccess,
  recordExternalRefund,
  recordPaymentFailure,
  recordPaymentSuccess,
} from '@/src/services/bookingLifecycle';
import { revalidateReservationLifecycleViews } from '@/src/lib/occupancyRevalidate';
import {
  recordRentPaymentFailure,
  recordRentPaymentSuccess,
} from '@/src/services/rentInvoices';
import {
  recordElectricityPaymentFailure,
  recordElectricityPaymentSuccess,
} from '@/src/services/electricityBilling';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Razorpay webhook receiver.
 *
 * Razorpay signs every webhook with HMAC-SHA256(secret, body). We verify
 * the signature BEFORE parsing the JSON to short-circuit malicious traffic.
 * The lifecycle service handles idempotency: replaying the same event is a
 * no-op.
 *
 * Note: Razorpay retries failed webhooks (non-2xx). We return 200 even for
 * known-bad payloads if the booking can't be matched, so Razorpay doesn't
 * retry forever — those go into the dead-letter audit log instead.
 */
export async function POST(req: NextRequest) {
  // The raw body is needed for HMAC verification — Next gives us text().
  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature');

  const verification = razorpayProvider.verifyWebhook({ rawBody, signature });
  if (!verification.ok) {
    return new Response(JSON.stringify({ ok: false, reason: verification.reason }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  const evt = verification.event;

  if (evt.kind === 'payment_succeeded') {
    // Phase 5 + 5.5 — fork on notes.kind. Each purpose has its own
    // lifecycle handler that knows how to flip the right rows.
    if (evt.purpose === 'extension') {
      const r = await recordExtensionPaymentSuccess({
        provider: 'razorpay',
        providerPaymentId: evt.providerPaymentId,
        providerOrderId: evt.providerOrderId,
        amountPaise: evt.amountPaise,
        currency: evt.currency,
        extensionId: evt.extensionId,
        rawPayload: evt.raw,
      });
      return Response.json(r, { status: 200 });
    }
    if (evt.purpose === 'rent') {
      const r = await recordRentPaymentSuccess({
        provider: 'razorpay',
        providerPaymentId: evt.providerPaymentId,
        providerOrderId: evt.providerOrderId,
        amountPaise: evt.amountPaise,
        invoiceId: evt.rentInvoiceId,
        rawPayload: evt.raw,
      });
      return Response.json(r, { status: 200 });
    }
    if (evt.purpose === 'electricity') {
      const r = await recordElectricityPaymentSuccess({
        provider: 'razorpay',
        providerPaymentId: evt.providerPaymentId,
        providerOrderId: evt.providerOrderId,
        amountPaise: evt.amountPaise,
        invoiceId: evt.electricityInvoiceId,
        rawPayload: evt.raw,
      });
      return Response.json(r, { status: 200 });
    }
    if (!evt.receipt) {
      return Response.json(
        { ok: false, reason: 'razorpay payment has no booking_code note' },
        { status: 200 },
      );
    }
    const r = await recordPaymentSuccess({
      provider: 'razorpay',
      providerPaymentId: evt.providerPaymentId,
      providerOrderId: evt.providerOrderId,
      amountPaise: evt.amountPaise,
      currency: evt.currency,
      bookingCode: evt.receipt,
      rawPayload: evt.raw,
    });
    if (r.ok && r.stateChanged && evt.receipt) {
      revalidateReservationLifecycleViews({ bookingCode: evt.receipt });
    }
    return Response.json(r, { status: r.ok ? 200 : 200 });
  }

  if (evt.kind === 'payment_failed') {
    if (evt.purpose === 'extension') {
      const r = await recordExtensionPaymentFailure({
        provider: 'razorpay',
        providerPaymentId: evt.providerPaymentId,
        providerOrderId: evt.providerOrderId,
        extensionId: evt.extensionId,
        reason: evt.reason,
        rawPayload: evt.raw,
      });
      return Response.json(r, { status: 200 });
    }
    if (evt.purpose === 'rent') {
      const r = await recordRentPaymentFailure({
        provider: 'razorpay',
        providerPaymentId: evt.providerPaymentId,
        providerOrderId: evt.providerOrderId,
        invoiceId: evt.rentInvoiceId,
        reason: evt.reason,
        rawPayload: evt.raw,
      });
      return Response.json(r, { status: 200 });
    }
    if (evt.purpose === 'electricity') {
      const r = await recordElectricityPaymentFailure({
        provider: 'razorpay',
        providerPaymentId: evt.providerPaymentId,
        providerOrderId: evt.providerOrderId,
        invoiceId: evt.electricityInvoiceId,
        reason: evt.reason,
        rawPayload: evt.raw,
      });
      return Response.json(r, { status: 200 });
    }
    // We MUST attach `notes.booking_code` when creating the order
    // (see src/services/payments.ts → razorpayProvider.createOrder), so the
    // failed event echoes it back. If it's still missing the booking pre-
    // dates that change and we have nothing to act on — 200 + log so
    // Razorpay doesn't retry forever.
    if (!evt.receipt) {
      return Response.json({
        ok: true,
        note: 'payment.failed missing booking_code note — acknowledged without action',
      });
    }
    const r = await recordPaymentFailure({
      provider: 'razorpay',
      providerPaymentId: evt.providerPaymentId,
      providerOrderId: evt.providerOrderId,
      bookingCode: evt.receipt,
      reason: evt.reason,
      rawPayload: evt.raw,
    });
    return Response.json(r, { status: 200 });
  }

  if (evt.kind === 'refund_succeeded') {
    // Refunds we issue via /admin already write their own negative payment
    // row via cancelBooking(); replaying a webhook for the same refund must
    // be a no-op (recordExternalRefund is idempotent on providerRefundId).
    const r = await recordExternalRefund({
      provider: 'razorpay',
      providerPaymentId: evt.providerPaymentId,
      providerRefundId: evt.providerRefundId,
      amountPaise: evt.amountPaise,
      rawPayload: evt.raw,
    });
    return Response.json(r, { status: 200 });
  }

  return Response.json({ ok: false, reason: 'unhandled event' }, { status: 200 });
}

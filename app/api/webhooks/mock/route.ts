import { NextRequest } from 'next/server';
import { isMockWebhookRouteEnabled, verifyMockWebhookRequest } from '@/src/lib/payments/mockWebhookAuth';
import { mockProvider } from '@/src/services/payments';
import {
  recordExtensionPaymentFailure,
  recordExtensionPaymentSuccess,
  recordPaymentFailure,
  recordPaymentSuccess,
} from '@/src/services/bookingLifecycle';
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
 * Dev/CI mock webhook — disabled in all production deployments.
 * Requires HMAC signature (MOCK_WEBHOOK_SECRET) and replay protection.
 */
export async function POST(req: NextRequest) {
  if (!isMockWebhookRouteEnabled()) {
    return new Response('Not Found', { status: 404 });
  }

  const rawBody = await req.text();
  const auth = await verifyMockWebhookRequest(rawBody, req.headers);
  if (!auth.ok) {
    if (auth.status === 403 && auth.reason.includes('disabled')) {
      return new Response('Not Found', { status: 404 });
    }
    return Response.json({ ok: false, reason: auth.reason }, { status: auth.status });
  }

  const verification = mockProvider.verifyWebhook({ rawBody, signature: 'verified-externally' });
  if (!verification.ok) {
    return Response.json({ ok: false, reason: verification.reason }, { status: 400 });
  }
  const evt = verification.event;

  if (evt.kind === 'payment_succeeded') {
    if (evt.purpose === 'extension') {
      const r = await recordExtensionPaymentSuccess({
        provider: 'mock',
        providerPaymentId: evt.providerPaymentId,
        providerOrderId: evt.providerOrderId,
        amountPaise: evt.amountPaise,
        currency: evt.currency,
        extensionId: evt.extensionId,
        rawPayload: evt.raw,
      });
      return Response.json(r, { status: r.ok ? 200 : 400 });
    }
    if (evt.purpose === 'rent') {
      const r = await recordRentPaymentSuccess({
        provider: 'mock',
        providerPaymentId: evt.providerPaymentId,
        providerOrderId: evt.providerOrderId,
        amountPaise: evt.amountPaise,
        invoiceId: evt.rentInvoiceId,
        rawPayload: evt.raw,
      });
      return Response.json(r, { status: r.ok ? 200 : 400 });
    }
    if (evt.purpose === 'electricity') {
      const r = await recordElectricityPaymentSuccess({
        provider: 'mock',
        providerPaymentId: evt.providerPaymentId,
        providerOrderId: evt.providerOrderId,
        amountPaise: evt.amountPaise,
        invoiceId: evt.electricityInvoiceId,
        rawPayload: evt.raw,
      });
      return Response.json(r, { status: r.ok ? 200 : 400 });
    }
    if (!evt.receipt) {
      return Response.json({ ok: false, reason: 'missing receipt (booking_code)' }, { status: 400 });
    }
    const r = await recordPaymentSuccess({
      provider: 'mock',
      providerPaymentId: evt.providerPaymentId,
      providerOrderId: evt.providerOrderId,
      amountPaise: evt.amountPaise,
      currency: evt.currency,
      bookingCode: evt.receipt,
      rawPayload: evt.raw,
    });
    return Response.json(r, { status: r.ok ? 200 : 400 });
  }

  if (evt.kind === 'payment_failed') {
    if (evt.purpose === 'extension') {
      const r = await recordExtensionPaymentFailure({
        provider: 'mock',
        providerPaymentId: evt.providerPaymentId,
        providerOrderId: evt.providerOrderId,
        extensionId: evt.extensionId,
        reason: evt.reason,
        rawPayload: evt.raw,
      });
      return Response.json(r, { status: r.ok ? 200 : 400 });
    }
    if (evt.purpose === 'rent') {
      const r = await recordRentPaymentFailure({
        provider: 'mock',
        providerPaymentId: evt.providerPaymentId,
        providerOrderId: evt.providerOrderId,
        invoiceId: evt.rentInvoiceId,
        reason: evt.reason,
        rawPayload: evt.raw,
      });
      return Response.json(r, { status: r.ok ? 200 : 400 });
    }
    if (evt.purpose === 'electricity') {
      const r = await recordElectricityPaymentFailure({
        provider: 'mock',
        providerPaymentId: evt.providerPaymentId,
        providerOrderId: evt.providerOrderId,
        invoiceId: evt.electricityInvoiceId,
        reason: evt.reason,
        rawPayload: evt.raw,
      });
      return Response.json(r, { status: r.ok ? 200 : 400 });
    }
    if (!evt.receipt) {
      return Response.json({ ok: false, reason: 'missing receipt (booking_code)' }, { status: 400 });
    }
    const r = await recordPaymentFailure({
      provider: 'mock',
      providerPaymentId: evt.providerPaymentId,
      providerOrderId: evt.providerOrderId,
      bookingCode: evt.receipt,
      reason: evt.reason,
      rawPayload: evt.raw,
    });
    return Response.json(r, { status: r.ok ? 200 : 400 });
  }

  return Response.json(
    { ok: false, reason: `mock route does not handle "${evt.kind}"` },
    { status: 400 },
  );
}

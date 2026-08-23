import { NextRequest, NextResponse } from 'next/server';
import {
  constructStripeEvent,
  processStripeWebhookEvent,
} from '@/src/platform/billing/stripe';

export const runtime = 'nodejs';

/** Platform SaaS Stripe webhooks — isolated from PG payment providers. */
export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  const rawBody = await request.text();
  let event;
  try {
    event = constructStripeEvent(rawBody, signature);
  } catch {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }
  const result = await processStripeWebhookEvent(event);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    received: true,
    duplicate: result.duplicate,
    type: result.eventType,
  });
}

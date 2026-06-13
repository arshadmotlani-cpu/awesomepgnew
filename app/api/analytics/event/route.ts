import { NextRequest, NextResponse } from 'next/server';
import type { AnalyticsEventType } from '@/src/db/schema/siteAnalyticsEvents';
import { trackAnalyticsEvent } from '@/src/services/visitorAnalytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED: ReadonlySet<AnalyticsEventType> = new Set([
  'pg_viewed',
  'room_viewed',
  'bed_selected',
  'booking_started',
  'payment_uploaded',
  'payment_completed',
  'kyc_submitted',
  'booking_approved',
  'check_in_completed',
]);

type Body = {
  eventType?: AnalyticsEventType;
  metadata?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.eventType || !ALLOWED.has(body.eventType)) {
    return NextResponse.json({ ok: false, error: 'Invalid event type' }, { status: 400 });
  }

  await trackAnalyticsEvent({
    eventType: body.eventType,
    metadata: body.metadata,
  });

  return NextResponse.json({ ok: true });
}

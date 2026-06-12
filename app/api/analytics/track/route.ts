import { NextRequest, NextResponse } from 'next/server';
import { VISITOR_SESSION_COOKIE } from '@/src/lib/analytics/constants';
import { shouldTrackPath } from '@/src/lib/analytics/pageKeys';
import { getCustomerSession } from '@/src/lib/auth/session';
import {
  ensureVisitorSession,
  getVisitorSessionIdFromCookies,
  trackPageView,
} from '@/src/services/visitorAnalytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  path?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const path = body.path?.trim();
  if (!path || !shouldTrackPath(path)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const [existingSessionId, customerSession] = await Promise.all([
      getVisitorSessionIdFromCookies(),
      getCustomerSession(),
    ]);

    const ctx = await ensureVisitorSession({
      existingSessionId,
      referrer: body.referrer ?? req.headers.get('referer'),
      utmSource: body.utmSource ?? req.nextUrl.searchParams.get('utm_source'),
      utmMedium: body.utmMedium ?? req.nextUrl.searchParams.get('utm_medium'),
      utmCampaign: body.utmCampaign ?? req.nextUrl.searchParams.get('utm_campaign'),
      userAgent: req.headers.get('user-agent'),
      customerId: customerSession?.customerId ?? null,
    });

    await trackPageView({ sessionId: ctx.sessionId, path });

    const res = NextResponse.json({ ok: true, sessionId: ctx.sessionId });
    if (!existingSessionId) {
      res.cookies.set(VISITOR_SESSION_COOKIE, ctx.sessionId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    return res;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/relation .*visitor_sessions.* does not exist/i.test(message)) {
      return NextResponse.json(
        { ok: false, error: 'Analytics tables not migrated.' },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: false, error: 'Tracking failed' }, { status: 500 });
  }
}

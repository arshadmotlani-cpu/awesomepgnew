import { NextRequest, NextResponse } from 'next/server';
import { shouldTrackPath } from '@/src/lib/analytics/pageKeys';
import {
  getVisitorSessionIdFromCookies,
  heartbeatSession,
} from '@/src/services/visitorAnalytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { path?: string };

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

  const sessionId = await getVisitorSessionIdFromCookies();
  if (!sessionId) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    await heartbeatSession({ sessionId, path });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

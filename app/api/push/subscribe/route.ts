import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { upsertPushSubscription } from '@/src/services/pushSubscriptions';

export const dynamic = 'force-dynamic';

type Body = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  deviceName?: string;
  platform?: string;
};

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ ok: false, error: 'Invalid subscription' }, { status: 400 });
  }

  await upsertPushSubscription('admin', session.adminId, {
    endpoint: body.endpoint,
    keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
    deviceName: body.deviceName ?? null,
    platform: body.platform ?? null,
  });

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { listPushSubscriptionsForUser } from '@/src/services/pushSubscriptions';
import { isPushConfigured } from '@/src/lib/push/webPush';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const endpoint = req.nextUrl.searchParams.get('endpoint')?.trim() ?? null;
  const subscriptions = await listPushSubscriptionsForUser('admin', session.adminId);
  const count = subscriptions.length;
  const hasMatchingEndpoint = endpoint
    ? subscriptions.some((s) => s.endpoint === endpoint)
    : false;

  return NextResponse.json({
    ok: true,
    vapidConfigured: isPushConfigured(),
    subscriptionCount: count,
    subscriptionInDatabase: count > 0,
    hasMatchingEndpoint,
    subscriptions: subscriptions.map((s) => ({
      id: s.id,
      endpointPreview: `${s.endpoint.slice(0, 48)}…`,
      deviceName: s.deviceName,
      platform: s.platform,
      lastSeen: s.lastSeen?.toISOString() ?? null,
      createdAt: s.createdAt?.toISOString() ?? null,
    })),
  });
}

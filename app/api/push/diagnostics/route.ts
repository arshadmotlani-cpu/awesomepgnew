import { NextResponse } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { isPushConfigured } from '@/src/lib/push/webPush';
import { listPushSubscriptionsForUser } from '@/src/services/pushSubscriptions';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const subscriptions = await listPushSubscriptionsForUser('admin', session.adminId);
  const count = subscriptions.length;

  return NextResponse.json({
    ok: true,
    vapidConfigured: isPushConfigured(),
    subscriptionCount: count,
    subscriptionInDatabase: count > 0,
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

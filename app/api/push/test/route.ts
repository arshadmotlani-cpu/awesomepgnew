import { NextResponse } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { sendWebPush, isPushConfigured } from '@/src/lib/push/webPush';
import { getDeliverablePushSubscriptions } from '@/src/services/pushSubscriptions';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!isPushConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'VAPID keys not configured on server' },
      { status: 503 },
    );
  }

  const subs = await getDeliverablePushSubscriptions('admin', session.adminId);
  if (subs.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'No push subscription saved for this admin' },
      { status: 404 },
    );
  }

  const payload = {
    title: 'Awesome PG — test notification',
    body: 'Push is working. You will receive alerts for bookings and payments.',
    deepLink: '/admin/system/push-diagnostics',
    notificationId: `test-${Date.now()}`,
    dedupeKey: `test-push:${session.adminId}:${Date.now()}`,
    unreadCount: 0,
    priority: 'normal',
  };

  const results = await Promise.allSettled(
    subs.map((sub) =>
      sendWebPush(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      ),
    ),
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  if (sent === 0) {
    const reason =
      results.find((r) => r.status === 'rejected')?.status === 'rejected'
        ? String((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason)
        : 'Unknown error';
    return NextResponse.json({ ok: false, error: reason, sent, failed }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sent, failed });
}

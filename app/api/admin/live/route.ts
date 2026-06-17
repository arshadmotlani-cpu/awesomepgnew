import { NextResponse } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { loadAdminNavBadges } from '@/src/services/adminNavBadges';
import { countUnreadNotifications } from '@/src/services/adminNotifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Lightweight poll endpoint for sidebar badges and notification bell. */
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const [badges, unreadCount] = await Promise.all([
    loadAdminNavBadges(session),
    countUnreadNotifications(session),
  ]);

  return NextResponse.json({
    ok: true,
    badges: { ...badges, overview: unreadCount, notifications: unreadCount },
    unreadCount,
    syncedAt: new Date().toISOString(),
  });
}

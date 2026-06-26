import { NextResponse } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { loadAdminNavBadges } from '@/src/services/adminNavBadges';
import { countUnreadForAdmin } from '@/src/services/notificationEngine';

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
    countUnreadForAdmin(session),
  ]);

  return NextResponse.json({
    ok: true,
    badges: {
      ...badges,
      notifications: unreadCount,
    },
    unreadCount,
    syncedAt: new Date().toISOString(),
  });
}

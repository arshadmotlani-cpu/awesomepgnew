import { NextResponse } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { loadAdminNavBadges } from '@/src/services/adminNavBadges';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Lightweight poll endpoint for sidebar badges and notification bell. */
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const badges = await loadAdminNavBadges(session, { pollCache: true });
  const unreadCount = badges.notifications ?? 0;

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

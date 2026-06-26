import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import {
  countUnreadForAdmin,
  listAdminInboxNotifications,
} from '@/src/services/notificationEngine';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const state = req.nextUrl.searchParams.get('state') ?? 'unread';
  const filter =
    state === 'read' || state === 'archived' || state === 'all' ? state : 'unread';

  const data = await listAdminInboxNotifications(session, filter, 50);
  const unreadCount = await countUnreadForAdmin(session);

  return NextResponse.json({
    ok: true,
    data: data.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
    unreadCount,
  });
}

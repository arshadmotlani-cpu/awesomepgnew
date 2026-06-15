import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import {
  countUnreadNotifications,
  listAdminNotifications,
} from '@/src/services/adminNotifications';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const state = req.nextUrl.searchParams.get('state') ?? 'unread';
  const filter =
    state === 'read' || state === 'archived' || state === 'all' ? state : 'unread';

  const data = await listAdminNotifications(session, filter, 50);
  const unreadCount = await countUnreadNotifications(session);

  return NextResponse.json({
    ok: true,
    data: data.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
    unreadCount,
  });
}

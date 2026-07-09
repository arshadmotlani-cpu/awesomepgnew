import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import {
  markNotificationRead,
} from '@/src/services/adminNotifications';
import {
  markUserNotificationRead,
  markUserNotificationsRead,
} from '@/src/services/notificationEngine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json()) as {
    notificationId?: string;
    userNotificationId?: string;
    sourceKey?: string;
    readKey?: string;
    archive?: boolean;
    markAllVisible?: boolean;
    notificationIds?: string[];
  };

  if (body.markAllVisible && body.notificationIds?.length) {
    const unreadCount = await markUserNotificationsRead(
      'admin',
      session.adminId,
      body.notificationIds,
    );
    return NextResponse.json({ ok: true, unreadCount });
  }

  if (body.notificationId) {
    const unreadCount = await markUserNotificationRead(
      'admin',
      session.adminId,
      body.notificationId,
    );
    return NextResponse.json({ ok: true, unreadCount });
  }

  if (body.userNotificationId) {
    const unreadCount = await markUserNotificationRead(
      'admin',
      session.adminId,
      body.userNotificationId,
    );
    return NextResponse.json({ ok: true, unreadCount });
  }

  if (body.archive && body.notificationId) {
    const unreadCount = await markUserNotificationRead(
      'admin',
      session.adminId,
      body.notificationId,
    );
    return NextResponse.json({ ok: true, unreadCount });
  }

  if (body.sourceKey || body.readKey) {
    await markNotificationRead(session, {
      notificationId: body.notificationId,
      sourceKey: body.sourceKey,
      readKey: body.readKey,
    });
  }

  return NextResponse.json({ ok: true, unreadCount: 0 });
}

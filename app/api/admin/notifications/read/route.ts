import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import {
  markNotificationRead,
} from '@/src/services/adminNotifications';
import { markUserNotificationRead } from '@/src/services/notificationEngine';

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
  };

  if (body.notificationId) {
    await markUserNotificationRead('admin', session.adminId, body.notificationId);
    return NextResponse.json({ ok: true });
  }

  if (body.userNotificationId) {
    await markUserNotificationRead('admin', session.adminId, body.userNotificationId);
    return NextResponse.json({ ok: true });
  }

  if (body.archive && body.notificationId) {
    await markUserNotificationRead('admin', session.adminId, body.notificationId);
    return NextResponse.json({ ok: true });
  }

  if (body.sourceKey || body.readKey) {
    await markNotificationRead(session, {
      notificationId: body.notificationId,
      sourceKey: body.sourceKey,
      readKey: body.readKey,
    });
  }

  return NextResponse.json({ ok: true });
}

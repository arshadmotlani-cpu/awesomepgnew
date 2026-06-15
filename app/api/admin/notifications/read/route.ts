import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import {
  archiveNotification,
  markNotificationRead,
} from '@/src/services/adminNotifications';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json()) as {
    notificationId?: string;
    sourceKey?: string;
    readKey?: string;
    archive?: boolean;
  };

  if (body.archive && body.notificationId) {
    await archiveNotification(session, body.notificationId);
    return NextResponse.json({ ok: true });
  }

  await markNotificationRead(session, {
    notificationId: body.notificationId,
    sourceKey: body.sourceKey,
    readKey: body.readKey,
  });

  return NextResponse.json({ ok: true });
}

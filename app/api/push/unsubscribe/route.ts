import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/src/lib/auth/session';
import { removePushSubscription } from '@/src/services/pushSubscriptions';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json()) as { endpoint?: string };
  if (!body.endpoint) {
    return NextResponse.json({ ok: false, error: 'Missing endpoint' }, { status: 400 });
  }

  await removePushSubscription('admin', session.adminId, body.endpoint);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { env } from '@/src/lib/env';

export const dynamic = 'force-dynamic';

export async function GET() {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json({ ok: false, error: 'Push not configured' }, { status: 503 });
  }
  return NextResponse.json({ ok: true, publicKey });
}

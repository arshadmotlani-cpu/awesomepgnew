import { NextResponse } from 'next/server';
import { getCustomerSession } from '@/src/lib/auth/session';

/** Silent session refresh for active resident portal usage. */
export async function POST() {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Sign in required.' }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    expiresAt: session.expiresAt.toISOString(),
    rememberMe: session.rememberMe,
  });
}

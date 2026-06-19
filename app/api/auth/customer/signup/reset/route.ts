import { NextResponse } from 'next/server';
import { clearSignupSessionCookie } from '@/src/lib/auth/signupSession';

/** Clear stale signup session cookie — safe fallback to login. */
export async function POST() {
  await clearSignupSessionCookie();
  return NextResponse.json({ ok: true });
}

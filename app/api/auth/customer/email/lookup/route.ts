import { NextResponse } from 'next/server';
import { resolveCustomerAuthSnapshot } from '@/src/lib/auth/resolveCustomerAuthState';
import { normaliseEmail } from '@/src/lib/email/address';

/** Check whether email belongs to an existing account (login vs signup routing). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = normaliseEmail(url.searchParams.get('email') ?? '');
  if (!email) {
    return NextResponse.json({ ok: false, message: 'Invalid email.' }, { status: 400 });
  }

  const snapshot = await resolveCustomerAuthSnapshot(email);
  if (!snapshot) {
    return NextResponse.json({ ok: false, message: 'Invalid email.' }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    email: snapshot.email,
    kind: snapshot.kind,
    shouldLogin: snapshot.shouldLogin,
    shouldSignup: snapshot.shouldSignup,
    message:
      snapshot.kind === 'existing_complete'
        ? 'This email already has an account. Sign in or use Forgot password.'
        : null,
  });
}

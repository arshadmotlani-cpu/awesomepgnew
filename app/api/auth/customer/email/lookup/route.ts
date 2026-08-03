import { NextResponse } from 'next/server';
import { RESIDENT_AUTH_COPY } from '@/src/lib/auth/residentAuthCopy';
import { resolveCustomerAuthSnapshot } from '@/src/lib/auth/resolveCustomerAuthState';
import { normaliseEmail } from '@/src/lib/email/address';

/** Check whether email belongs to an existing account (Login vs Sign Up routing). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = normaliseEmail(url.searchParams.get('email') ?? '');
  if (!email) {
    return NextResponse.json(
      { ok: false, message: RESIDENT_AUTH_COPY.invalidEmail },
      { status: 400 },
    );
  }

  const snapshot = await resolveCustomerAuthSnapshot(email);
  if (!snapshot) {
    return NextResponse.json(
      { ok: false, message: RESIDENT_AUTH_COPY.invalidEmail },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    email: snapshot.email,
    kind: snapshot.kind,
    shouldLogin: snapshot.shouldLogin,
    shouldSignup: snapshot.shouldSignup,
    notice: snapshot.shouldLogin ? 'welcome_back' : snapshot.shouldSignup ? 'no_account' : null,
    message:
      snapshot.kind === 'existing_complete'
        ? RESIDENT_AUTH_COPY.welcomeBackBody
        : snapshot.kind === 'new'
          ? RESIDENT_AUTH_COPY.noAccountExists
          : null,
  });
}

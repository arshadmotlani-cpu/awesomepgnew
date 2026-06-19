import { NextResponse } from 'next/server';
import {
  findCustomerByEmail,
  isAccountComplete,
  upsertRecoveryCustomerProfile,
} from '@/src/lib/auth/customer';
import { isRecoveryVerifiedForEmail } from '@/src/lib/auth/recoverySession';
import {
  getActiveSignupSessionForEmail,
  readSignupSessionFromRequest,
  submitSignupProfile,
} from '@/src/lib/auth/signupSession';
import { normaliseEmail } from '@/src/lib/email/address';
import { normaliseIndianPhone } from '@/src/lib/phone';

/** Save name + phone during forgot-password recovery — uses customers table directly. */
export async function POST(request: Request) {
  let body: { email?: string; fullName?: string; phone?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON body.' }, { status: 400 });
  }

  const email = normaliseEmail(body.email ?? '');
  if (!email) {
    return NextResponse.json({ ok: false, message: 'Invalid email address.' }, { status: 400 });
  }

  const fullName = (body.fullName ?? '').trim();
  const phone = normaliseIndianPhone(body.phone ?? '');
  if (fullName.length < 2) {
    return NextResponse.json(
      { ok: false, message: 'Enter your full name to continue.' },
      { status: 400 },
    );
  }
  if (!phone) {
    return NextResponse.json(
      { ok: false, message: 'Enter a valid 10-digit mobile number.' },
      { status: 400 },
    );
  }

  const recoveryOk = await isRecoveryVerifiedForEmail(email);
  const signupSession =
    (await readSignupSessionFromRequest()) ?? (await getActiveSignupSessionForEmail(email));
  const signupOk = Boolean(signupSession?.otpVerified && signupSession.email === email);

  if (!recoveryOk && !signupOk) {
    return NextResponse.json(
      {
        ok: false,
        message: 'Your verification expired. Request a new code and try again.',
        needsNewCode: true,
      },
      { status: 401 },
    );
  }

  const existing = await findCustomerByEmail(email);
  if (existing && isAccountComplete(existing)) {
    return NextResponse.json(
      {
        ok: false,
        needsLogin: true,
        message: 'This email already has an account. Sign in with your password.',
      },
      { status: 400 },
    );
  }

  try {
    const customer = await upsertRecoveryCustomerProfile({
      email,
      fullName,
      phone: body.phone ?? '',
    });

    if (signupSession?.otpVerified) {
      try {
        await submitSignupProfile({
          sessionId: signupSession.id,
          fullName,
          phone: body.phone ?? '',
        });
      } catch {
        /* customers row is source of truth for recovery */
      }
    }

    return NextResponse.json({
      ok: true,
      email: customer.email,
      fullName: customer.fullName,
      phone: customer.phone,
      needsPassword: true,
    });
  } catch (err) {
    console.error('[auth/forgot-password/profile] failed', {
      email,
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        ok: false,
        message:
          err instanceof Error && err.message
            ? err.message
            : 'Could not save your profile. Please try again.',
        retryable: true,
      },
      { status: 500 },
    );
  }
}

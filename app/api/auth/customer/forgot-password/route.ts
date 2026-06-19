import { NextResponse } from 'next/server';
import {
  commitSignupCustomer,
  findCustomerByEmail,
  isAccountComplete,
  setCustomerPassword,
} from '@/src/lib/auth/customer';
import {
  completeSignupSession,
  getActiveSignupSessionForEmail,
  readSignupSessionFromRequest,
} from '@/src/lib/auth/signupSession';
import { verifyEmailOtp } from '@/src/lib/auth/otp';
import { validateCustomerPassword } from '@/src/lib/auth/password';
import { createCustomerSession } from '@/src/lib/auth/session';
import { normaliseEmail } from '@/src/lib/email/address';

export async function POST(request: Request) {
  let body: {
    email?: string;
    code?: string;
    password?: string;
    confirmPassword?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON body.' }, { status: 400 });
  }

  const email = normaliseEmail(body.email ?? '');
  if (!email) {
    return NextResponse.json({ ok: false, message: 'Invalid email address.' }, { status: 400 });
  }

  const password = body.password ?? '';
  const confirmPassword = body.confirmPassword ?? '';
  if (!password || !confirmPassword) {
    return NextResponse.json(
      { ok: false, message: 'Password and confirmation are required.' },
      { status: 400 },
    );
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ ok: false, message: 'Passwords do not match.' }, { status: 400 });
  }

  const policyError = validateCustomerPassword(password);
  if (policyError) {
    return NextResponse.json({ ok: false, message: policyError }, { status: 400 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent');
  const otpCtx = { ip, userAgent };

  // Legacy: code sent with password (single step). Prefer /forgot-password/verify first.
  if (body.code?.trim()) {
    const verified = await verifyEmailOtp(email, body.code, otpCtx, { consume: true });
    if (!verified.ok) {
      return NextResponse.json(verified, { status: 400 });
    }
  }

  const customer = await findCustomerByEmail(email);
  const signupSession =
    (await readSignupSessionFromRequest()) ??
    (await getActiveSignupSessionForEmail(email));

  if (!signupSession?.otpVerified && !body.code?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        message: 'Your verification expired. Request a new code and try again.',
        needsNewCode: true,
      },
      { status: 401 },
    );
  }

  const profileReady =
    (signupSession?.profileSubmitted && signupSession.fullName && signupSession.phone) ||
    (customer &&
      !customer.archivedAt &&
      Boolean(customer.fullName?.trim() && customer.phone?.trim()));

  if (!profileReady) {
    return NextResponse.json(
      {
        ok: false,
        needsProfile: true,
        email,
        message: 'Tell us your name and mobile number first, then choose a password.',
      },
      { status: 400 },
    );
  }

  try {
    if (customer && !customer.archivedAt) {
      if (isAccountComplete(customer) || customer.passwordHash) {
        await setCustomerPassword(customer.id, password);
      } else {
        await setCustomerPassword(customer.id, password);
      }
      if (signupSession) await completeSignupSession(signupSession.id);
      await createCustomerSession({ customerId: customer.id, ip, userAgent });
      return NextResponse.json({
        ok: true,
        customerId: customer.id,
        email: customer.email,
        mustSetPassword: false,
      });
    }

    if (signupSession?.profileSubmitted) {
      const committed = await commitSignupCustomer({
        email: signupSession.email,
        fullName: signupSession.fullName ?? '',
        phone: signupSession.phone ?? '',
        password,
      });
      await completeSignupSession(signupSession.id);
      await createCustomerSession({ customerId: committed.id, ip, userAgent });
      return NextResponse.json({
        ok: true,
        customerId: committed.id,
        email: committed.email,
        mustSetPassword: false,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        needsProfile: true,
        email,
        message: 'Tell us your name and mobile number first, then choose a password.',
      },
      { status: 400 },
    );
  } catch (err) {
    console.error('[auth/forgot-password] failed', {
      email,
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        ok: false,
        message:
          err instanceof Error && err.message
            ? err.message
            : 'Could not save your password. Please try again.',
        retryable: true,
      },
      { status: 500 },
    );
  }
}

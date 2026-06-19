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

  const verified = await verifyEmailOtp(body.email ?? '', body.code ?? '', otpCtx, { consume: true });
  if (!verified.ok) {
    return NextResponse.json(verified, { status: 400 });
  }

  const customer = await findCustomerByEmail(body.email ?? '');
  const signupSession =
    (await readSignupSessionFromRequest()) ??
    (await getActiveSignupSessionForEmail(body.email ?? ''));

  if (!customer || customer.archivedAt) {
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
        useSetPassword: true,
        message: 'Complete your profile first, then set a password.',
      },
      { status: 400 },
    );
  }

  if (!customer.passwordHash || customer.mustSetPassword) {
    await setCustomerPassword(customer.id, password);
    await createCustomerSession({ customerId: customer.id, ip, userAgent });
    if (signupSession) await completeSignupSession(signupSession.id);
    return NextResponse.json({
      ok: true,
      customerId: customer.id,
      email: customer.email,
      mustSetPassword: false,
      firstPasswordSet: true,
    });
  }

  if (isAccountComplete(customer)) {
    await setCustomerPassword(customer.id, password);
    await createCustomerSession({ customerId: customer.id, ip, userAgent });
    return NextResponse.json({
      ok: true,
      customerId: customer.id,
      email: customer.email,
      mustSetPassword: false,
    });
  }

  return NextResponse.json({ ok: false, message: 'Could not reset password.' }, { status: 400 });
}

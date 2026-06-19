import { NextResponse } from 'next/server';
import { findCustomerByEmail, setCustomerPassword } from '@/src/lib/auth/customer';
import { getActiveSignupSessionForEmail } from '@/src/lib/auth/signupSession';
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

  const customer = await findCustomerByEmail(body.email ?? '');
  if (!customer || customer.archivedAt) {
    const pendingSignup = await getActiveSignupSessionForEmail(body.email ?? '');
    if (pendingSignup) {
      return NextResponse.json(
        {
          ok: false,
          needsCompleteSignup: true,
          message: 'Finish signing up first — verify your email, then create a password.',
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: false, message: 'No account found for this email.' }, { status: 400 });
  }

  if (!customer.passwordHash || customer.mustSetPassword) {
    return NextResponse.json(
      {
        ok: false,
        needsCompleteSignup: true,
        message: 'Complete your signup by creating a password first.',
      },
      { status: 400 },
    );
  }

  const verified = await verifyEmailOtp(body.email ?? '', body.code ?? '', otpCtx, { consume: true });
  if (!verified.ok) {
    return NextResponse.json(verified, { status: 400 });
  }

  await setCustomerPassword(customer.id, password);
  await createCustomerSession({ customerId: customer.id, ip, userAgent });

  return NextResponse.json({
    ok: true,
    customerId: customer.id,
    email: customer.email,
    mustSetPassword: false,
  });
}

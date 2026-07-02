import { NextResponse } from 'next/server';
import { findCustomerByLoginIdentifier } from '@/src/lib/auth/loginIdentifier';
import { getActiveSignupSessionForEmail } from '@/src/lib/auth/signupSession';
import { verifyPassword } from '@/src/lib/auth/crypto';
import { loginRateLimitStatus, recordLoginAttempt } from '@/src/lib/auth/loginRateLimit';
import { createCustomerSession } from '@/src/lib/auth/session';
import { logger } from '@/src/lib/logger';

export async function POST(request: Request) {
  let body: { email?: string; identifier?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; identifier?: string; password?: string };
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON body.' }, { status: 400 });
  }

  const identifierInput = (body.identifier ?? body.email ?? '').trim();
  const password = body.password ?? '';
  if (!identifierInput || !password) {
    return NextResponse.json(
      { ok: false, message: 'Email or phone and password are required.' },
      { status: 400 },
    );
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent');

  const resolved = await findCustomerByLoginIdentifier(identifierInput);
  if (!resolved) {
    const pendingSignup =
      identifierInput.includes('@')
        ? await getActiveSignupSessionForEmail(identifierInput)
        : null;
    if (pendingSignup) {
      return NextResponse.json(
        {
          ok: false,
          needsCompleteSignup: true,
          message:
            'This account is not finished yet. Use Forgot password — we will email you a code to complete setup.',
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, message: 'Invalid email, phone, or password.' },
      { status: 401 },
    );
  }

  const { customer, identifier } = resolved;
  const rate = await loginRateLimitStatus({ email: customer.email, ip });
  if (rate.blocked) {
    return NextResponse.json(
      {
        ok: false,
        message: 'Too many sign-in attempts. Please wait an hour and try again.',
        retryAfterSeconds: rate.retryAfterSeconds,
      },
      { status: 429 },
    );
  }

  if (!customer.passwordHash) {
    await recordLoginAttempt({
      email: customer.email,
      success: false,
      reason: 'no_password',
      ip,
      userAgent,
    });
    return NextResponse.json(
      {
        ok: false,
        needsCompleteSignup: true,
        message:
          'No password on this account yet. Use Forgot password — we will email you a code to finish setup.',
      },
      { status: 400 },
    );
  }

  if (!verifyPassword(password, customer.passwordHash)) {
    await recordLoginAttempt({
      email: customer.email,
      success: false,
      reason: 'bad_password',
      ip,
      userAgent,
    });
    return NextResponse.json(
      {
        ok: false,
        accountExists: true,
        message: 'Incorrect password. Try again or use Forgot password.',
      },
      { status: 401 },
    );
  }

  await recordLoginAttempt({
    email: customer.email,
    success: true,
    ip,
    userAgent,
  });

  await createCustomerSession({ customerId: customer.id, ip, userAgent });

  logger.info('customer_login_success', {
    customerId: customer.id,
    email: customer.email,
    loginVia: identifier.kind,
    sessionKind: 'customer',
    mustSetPassword: customer.mustSetPassword,
    userAgent,
    ip,
  });

  return NextResponse.json({
    ok: true,
    customerId: customer.id,
    email: customer.email,
    mustSetPassword: customer.mustSetPassword,
  });
}

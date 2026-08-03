import { NextResponse } from 'next/server';
import { CUSTOMER_SESSION_COOKIE } from '@/src/lib/auth/constants';
import { findCustomerByLoginIdentifier } from '@/src/lib/auth/loginIdentifier';
import { RESIDENT_AUTH_COPY } from '@/src/lib/auth/residentAuthCopy';
import { getActiveSignupSessionForEmail } from '@/src/lib/auth/signupSession';
import { verifyPassword } from '@/src/lib/auth/crypto';
import { loginRateLimitStatus, recordLoginAttempt } from '@/src/lib/auth/loginRateLimit';
import { createCustomerSession } from '@/src/lib/auth/session';
import { customerSessionExpiry } from '@/src/lib/auth/customerSessionPolicy';
import { env } from '@/src/lib/env';
import { logger } from '@/src/lib/logger';

export async function POST(request: Request) {
  let body: { email?: string; identifier?: string; password?: string; rememberMe?: boolean };
  try {
    body = (await request.json()) as {
      email?: string;
      identifier?: string;
      password?: string;
      rememberMe?: boolean;
    };
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON body.' }, { status: 400 });
  }

  const identifierInput = (body.identifier ?? body.email ?? '').trim();
  const password = body.password ?? '';
  if (!identifierInput) {
    return NextResponse.json(
      { ok: false, message: RESIDENT_AUTH_COPY.emptyEmail },
      { status: 400 },
    );
  }
  if (!password) {
    return NextResponse.json(
      { ok: false, message: RESIDENT_AUTH_COPY.emptyPassword },
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
    const isEmail = identifierInput.includes('@');
    return NextResponse.json(
      {
        ok: false,
        accountExists: false,
        shouldSignup: isEmail,
        message: isEmail
          ? RESIDENT_AUTH_COPY.noAccountExists
          : 'No account exists with this mobile number.',
      },
      { status: 401 },
    );
  }

  const { customer, identifier } = resolved;
  const rate = await loginRateLimitStatus({ email: customer.email, ip });
  if (rate.blocked) {
    return NextResponse.json(
      {
        ok: false,
        message: RESIDENT_AUTH_COPY.tooManyAttempts,
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
        message: RESIDENT_AUTH_COPY.incorrectPassword,
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

  const rememberMe = body.rememberMe !== false;
  const token = await createCustomerSession({
    customerId: customer.id,
    rememberMe,
    ip,
    userAgent,
  });

  logger.info('customer_login_success', {
    customerId: customer.id,
    email: customer.email,
    loginVia: identifier.kind,
    sessionKind: 'customer',
    mustSetPassword: customer.mustSetPassword,
    userAgent,
    ip,
  });

  // Also attach Set-Cookie on the response object — belt-and-suspenders with cookies().set
  // so the browser always receives the session even if the cookie store attach races.
  const response = NextResponse.json({
    ok: true,
    customerId: customer.id,
    email: customer.email,
    mustSetPassword: customer.mustSetPassword,
  });
  response.cookies.set(CUSTOMER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires: customerSessionExpiry(rememberMe),
  });
  return response;
}

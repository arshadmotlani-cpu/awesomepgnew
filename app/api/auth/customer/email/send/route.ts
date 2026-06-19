import { NextResponse } from 'next/server';
import { findCustomerByEmail, isAccountComplete, isIncompleteSignup } from '@/src/lib/auth/customer';
import { getActiveSignupSessionForEmail } from '@/src/lib/auth/signupSession';
import { sendEmailOtp } from '@/src/lib/auth/otp';

export type OtpPurpose = 'signup' | 'forgot_password';

export async function POST(request: Request) {
  let body: { email?: string; purpose?: OtpPurpose };
  try {
    body = (await request.json()) as { email?: string; purpose?: OtpPurpose };
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON body.' }, { status: 400 });
  }

  const purpose: OtpPurpose = body.purpose === 'forgot_password' ? 'forgot_password' : 'signup';
  const customer = await findCustomerByEmail(body.email ?? '');

  if (purpose === 'signup' && customer && isAccountComplete(customer)) {
    return NextResponse.json(
      {
        ok: false,
        needsLogin: true,
        accountExists: true,
        message: 'This email already has an account. Sign in with your password or use Forgot password.',
      },
      { status: 400 },
    );
  }

  if (purpose === 'forgot_password') {
    if (!customer || customer.archivedAt) {
      const pendingSignup = await getActiveSignupSessionForEmail(body.email ?? '');
      if (pendingSignup) {
        return NextResponse.json(
          {
            ok: false,
            needsCompleteSignup: true,
            message: 'No password set yet. Finish signup or use Sign in if you already have a password.',
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        {
          ok: false,
          message: 'No account found for this email. Sign up if you are new here.',
        },
        { status: 400 },
      );
    }
    if (isIncompleteSignup(customer)) {
      return NextResponse.json(
        {
          ok: false,
          needsCompleteSignup: true,
          needsLogin: false,
          message:
            'This account has no password yet. Finish signup with an email code, or contact support if you believe this is an error.',
        },
        { status: 400 },
      );
    }
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent');

  const result = await sendEmailOtp(body.email ?? '', { ip, userAgent });
  if (!result.ok) {
    return NextResponse.json(result, {
      status: result.retryAfterSeconds ? 429 : 400,
    });
  }

  return NextResponse.json({
    ok: true,
    email: result.email,
    expiresAt: result.expiresAt.toISOString(),
    resendAfter: result.resendAfter,
    delivery: result.delivery,
    ...(purpose === 'signup' && customer && isIncompleteSignup(customer)
      ? { needsCompleteSignup: true, resumeSignup: true }
      : {}),
  });
}

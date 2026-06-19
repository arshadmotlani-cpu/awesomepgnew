import { NextResponse } from 'next/server';
import {
  findCustomerByEmail,
  isAccountComplete,
} from '@/src/lib/auth/customer';
import { verifyEmailOtp } from '@/src/lib/auth/otp';
import {
  getActiveSignupSessionForEmail,
  issueSignupSessionCookie,
  markSignupOtpVerified,
  readSignupSessionFromRequest,
} from '@/src/lib/auth/signupSession';
import { normaliseEmail } from '@/src/lib/email/address';

export type ForgotPasswordNextStep = 'profile' | 'password';

/** Verify recovery OTP once, then route to profile or password step. */
export async function POST(request: Request) {
  let body: { email?: string; code?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON body.' }, { status: 400 });
  }

  const email = normaliseEmail(body.email ?? '');
  if (!email) {
    return NextResponse.json({ ok: false, message: 'Invalid email address.' }, { status: 400 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent');
  const otpCtx = { ip, userAgent };

  const verified = await verifyEmailOtp(email, body.code ?? '', otpCtx, { consume: true });
  if (!verified.ok) {
    return NextResponse.json(verified, { status: 400 });
  }

  try {
    let session =
      (await readSignupSessionFromRequest()) ?? (await getActiveSignupSessionForEmail(email));
    if (!session?.otpVerified) {
      session = await markSignupOtpVerified(email);
    }
    await issueSignupSessionCookie(session.id, session.expiresAt);

    const customer = await findCustomerByEmail(email);
    if (customer && !customer.archivedAt) {
      const hasProfile = Boolean(customer.fullName?.trim() && customer.phone?.trim());
      if (isAccountComplete(customer) || customer.passwordHash || hasProfile) {
        return NextResponse.json({
          ok: true,
          nextStep: 'password' satisfies ForgotPasswordNextStep,
          email,
        });
      }
    }

    if (session.profileSubmitted && session.fullName && session.phone) {
      return NextResponse.json({
        ok: true,
        nextStep: 'password' satisfies ForgotPasswordNextStep,
        email,
        fullName: session.fullName,
        phone: session.phone,
      });
    }

    return NextResponse.json({
      ok: true,
      nextStep: 'profile' satisfies ForgotPasswordNextStep,
      email,
      fullName: session.fullName ?? customer?.fullName ?? '',
      phone: session.phone ?? customer?.phone?.replace(/^\+91/, '') ?? '',
    });
  } catch (err) {
    console.error('[auth/forgot-password/verify] failed', {
      email,
      reason: err instanceof Error ? err.message : String(err),
    });
    const message = err instanceof Error ? err.message : String(err);
    const isMissingTable =
      message.includes('signup_sessions') ||
      message.includes('relation') ||
      message.includes('does not exist');
    return NextResponse.json(
      {
        ok: false,
        message: isMissingTable
          ? 'Account recovery is temporarily unavailable. Please contact support.'
          : 'Could not verify your code. Please try again.',
        retryable: true,
      },
      { status: isMissingTable ? 503 : 500 },
    );
  }
}

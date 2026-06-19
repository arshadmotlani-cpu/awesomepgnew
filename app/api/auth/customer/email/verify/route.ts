import { NextResponse } from 'next/server';
import {
  findCustomerByEmail,
  findCustomerByPhone,
  isAccountComplete,
  isIncompleteSignup,
} from '@/src/lib/auth/customer';
import { authLog } from '@/src/lib/auth/authLog';
import { verifyEmailOtp } from '@/src/lib/auth/otp';
import { profileRedirectWithNext } from '@/src/lib/auth/safeNext';
import {
  clearSignupVerificationCookie,
  SIGNUP_SETUP_EXPIRED_MESSAGE,
} from '@/src/lib/auth/signupVerification';
import {
  clearSignupSessionCookie,
  getActiveSignupSessionForEmail,
  getSignupSessionById,
  issueSignupSessionCookie,
  markSignupOtpVerified,
  readSignupSessionCookie,
  signupSessionPublicState,
  submitSignupProfile,
} from '@/src/lib/auth/signupSession';
import { resolveCustomerAuthSnapshot } from '@/src/lib/auth/resolveCustomerAuthState';
import { createCustomerSession } from '@/src/lib/auth/session';
import { normaliseEmail } from '@/src/lib/email/address';
import { normaliseIndianPhone } from '@/src/lib/phone';
import { isProfileComplete } from '@/src/services/profile';

async function handleProfileStep(args: {
  email: string;
  fullName: string;
  phone: string;
  code?: string;
  otpCtx: { ip: string | null; userAgent: string | null };
}) {
  const { email, fullName, phone, code, otpCtx } = args;

  const existingSnapshot = await resolveCustomerAuthSnapshot(email);
  if (existingSnapshot?.kind === 'existing_complete') {
    await clearSignupSessionCookie();
    return NextResponse.json(
      {
        ok: false,
        needsLogin: true,
        email,
        message: 'This email already has an account. Sign in with your password or use Forgot password.',
      },
      { status: 400 },
    );
  }

  if (fullName.length < 2) {
    return NextResponse.json(
      { ok: false, needsProfile: true, email, message: 'Enter your full name to continue.' },
      { status: 400 },
    );
  }
  if (!phone) {
    return NextResponse.json(
      {
        ok: false,
        needsProfile: true,
        email,
        message: 'Enter a valid 10-digit mobile number.',
      },
      { status: 400 },
    );
  }

  const phoneOwner = await findCustomerByPhone(phone);
  if (phoneOwner && isAccountComplete(phoneOwner) && phoneOwner.email !== email) {
    return NextResponse.json(
      {
        ok: false,
        needsProfile: true,
        email,
        message:
          'This mobile number is already linked to another account. Use a different number or sign in with that account.',
      },
      { status: 400 },
    );
  }

  let sessionId = await readSignupSessionCookie();
  let session = sessionId ? await getSignupSessionById(sessionId) : null;

  if (!session || session.email !== email) {
    const active = await getActiveSignupSessionForEmail(email);
    if (active?.otpVerified) {
      session = active;
      sessionId = active.id;
    }
  }

  if (!session?.otpVerified) {
    if (code?.trim()) {
      const verified = await verifyEmailOtp(email, code, otpCtx, { consume: true });
      if (!verified.ok) {
        const message = verified.message.includes('No active code')
          ? SIGNUP_SETUP_EXPIRED_MESSAGE
          : verified.message;
        return NextResponse.json({ ok: false, message, needsNewCode: true }, { status: 400 });
      }
      const hadSession = Boolean(session);
      session = await markSignupOtpVerified(verified.email);
      sessionId = session.id;
      authLog(hadSession ? 'signup_session_resumed' : 'signup_session_created', {
        email: session.email,
        sessionId: session.id,
        step: 'PROFILE',
      });
      authLog('otp_verified', { email: session.email, sessionId: session.id });
    } else {
      return NextResponse.json(
        { ok: false, message: SIGNUP_SETUP_EXPIRED_MESSAGE, needsNewCode: true },
        { status: 400 },
      );
    }
  }

  if (
    session.profileSubmitted &&
    session.fullName === fullName &&
    session.phone === phone
  ) {
    authLog('duplicate_submission_blocked', {
      email: session.email,
      sessionId: session.id,
      step: 'PASSWORD',
    });
    await issueSignupSessionCookie(session.id, session.expiresAt);
    await clearSignupVerificationCookie();
    return NextResponse.json({
      ok: true,
      needsPassword: true,
      email: session.email,
      fullName: session.fullName,
      phone: session.phone,
      signupSession: signupSessionPublicState(session),
      alreadySubmitted: true,
    });
  }

  const updated = await submitSignupProfile({ sessionId: session.id, fullName, phone });

  authLog('profile_saved', {
    email: updated.email,
    sessionId: updated.id,
    step: 'PASSWORD',
  });

  await issueSignupSessionCookie(updated.id, updated.expiresAt);
  await clearSignupVerificationCookie();

  return NextResponse.json({
    ok: true,
    needsPassword: true,
    email: updated.email,
    fullName: updated.fullName,
    phone: updated.phone,
    signupSession: signupSessionPublicState(updated),
  });
}

export async function POST(request: Request) {
  let body: {
    email?: string;
    code?: string;
    fullName?: string;
    phone?: string;
    next?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON body.' }, { status: 400 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent');
  const otpCtx = { ip, userAgent };

  const email = normaliseEmail(body.email ?? '');
  if (!email) {
    return NextResponse.json({ ok: false, message: 'Invalid email address.' }, { status: 400 });
  }

  const fullName = (body.fullName ?? '').trim();
  const phone = normaliseIndianPhone(body.phone ?? '');
  const hasProfileFields = Boolean(fullName && phone);
  const existingCustomer = await findCustomerByEmail(email);

  try {
    // ── Profile step FIRST (SignupSession only — never blocked by legacy partial rows) ──
    if (hasProfileFields) {
      return handleProfileStep({
        email,
        fullName,
        phone: phone!,
        code: body.code,
        otpCtx,
      });
    }

    // ── Existing complete account: OTP sign-in ──
    if (existingCustomer && isAccountComplete(existingCustomer)) {
      const verified = await verifyEmailOtp(body.email ?? '', body.code ?? '', otpCtx, {
        consume: true,
      });
      if (!verified.ok) {
        return NextResponse.json(verified, { status: 400 });
      }

      if (!isProfileComplete(existingCustomer)) {
        await createCustomerSession({
          customerId: existingCustomer.id,
          ip,
          userAgent,
        });
        return NextResponse.json(
          {
            ok: false,
            needsProfileComplete: true,
            email: verified.email,
            message: 'Complete your resident profile to continue.',
            redirect: profileRedirectWithNext(body.next),
          },
          { status: 400 },
        );
      }

      await createCustomerSession({
        customerId: existingCustomer.id,
        ip,
        userAgent,
      });
      await clearSignupVerificationCookie();

      return NextResponse.json({
        ok: true,
        customerId: existingCustomer.id,
        email: existingCustomer.email,
        phone: existingCustomer.phone,
        fullName: existingCustomer.fullName,
        mustSetPassword: false,
      });
    }

    // ── Resume: OTP already verified for this email ──
    const pendingSession = await getActiveSignupSessionForEmail(email);
    if (pendingSession?.otpVerified) {
      if (existingCustomer && isAccountComplete(existingCustomer)) {
        await clearSignupSessionCookie();
        return NextResponse.json(
          {
            ok: false,
            needsLogin: true,
            email,
            message: 'This email already has an account. Sign in with your password.',
          },
          { status: 400 },
        );
      }

      const cookieSessionId = await readSignupSessionCookie();
      if (cookieSessionId !== pendingSession.id) {
        await issueSignupSessionCookie(pendingSession.id, pendingSession.expiresAt);
      }

      authLog('signup_session_resumed', {
        email: pendingSession.email,
        sessionId: pendingSession.id,
        step: pendingSession.profileSubmitted ? 'PASSWORD' : 'PROFILE',
      });

      if (pendingSession.profileSubmitted) {
        return NextResponse.json({
          ok: true,
          needsPassword: true,
          email: pendingSession.email,
          fullName: pendingSession.fullName,
          phone: pendingSession.phone,
          signupSession: signupSessionPublicState(pendingSession),
          alreadyVerified: true,
        });
      }

      return NextResponse.json(
        {
          ok: false,
          needsProfile: true,
          emailVerified: true,
          email,
          alreadyVerified: true,
          signupSession: signupSessionPublicState(pendingSession),
        },
        { status: 200 },
      );
    }

    // ── Legacy incomplete account: OTP-only step (must have code) ──
    if (existingCustomer && isIncompleteSignup(existingCustomer) && body.code?.trim()) {
      const verified = await verifyEmailOtp(body.email ?? '', body.code, otpCtx, { consume: true });
      if (!verified.ok) {
        return NextResponse.json(verified, { status: 400 });
      }

      await createCustomerSession({
        customerId: existingCustomer.id,
        ip,
        userAgent,
      });
      await clearSignupVerificationCookie();

      return NextResponse.json({
        ok: true,
        email: existingCustomer.email,
        mustSetPassword: true,
        needsPassword: true,
        legacyIncomplete: true,
        message: 'Complete your signup by creating a password.',
      });
    }

    // ── New signup: OTP verification → SignupSession only ──
    const verified = await verifyEmailOtp(body.email ?? '', body.code ?? '', otpCtx, {
      consume: true,
    });
    if (!verified.ok) {
      return NextResponse.json(verified, { status: 400 });
    }

    const session = await markSignupOtpVerified(verified.email);
    await issueSignupSessionCookie(session.id, session.expiresAt);
    await clearSignupVerificationCookie();

    authLog('signup_session_created', {
      email: session.email,
      sessionId: session.id,
      step: 'PROFILE',
    });
    authLog('otp_verified', { email: session.email, sessionId: session.id });

    return NextResponse.json(
      {
        ok: false,
        needsProfile: true,
        emailVerified: true,
        email: verified.email,
        signupSession: signupSessionPublicState(session),
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[auth/signup/verify] failed', {
      email,
      reason: err instanceof Error ? err.message : String(err),
    });
    const message =
      err instanceof Error && err.message
        ? err.message
        : 'We could not finish setting up your account. Please try again.';
    const isMissingTable =
      message.includes('signup_sessions') ||
      message.includes('relation') ||
      message.includes('does not exist');
    return NextResponse.json(
      {
        ok: false,
        message: isMissingTable
          ? 'Signup is temporarily unavailable. Please try again shortly or contact support.'
          : message,
        retryable: true,
      },
      { status: isMissingTable ? 503 : 500 },
    );
  }
}

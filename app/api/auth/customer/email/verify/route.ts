import { NextResponse } from 'next/server';
import {
  findCustomerByEmail,
  findCustomerByPhone,
  isAccountComplete,
  isIncompleteSignup,
} from '@/src/lib/auth/customer';
import { verifyEmailOtp } from '@/src/lib/auth/otp';
import { profileRedirectWithNext } from '@/src/lib/auth/safeNext';
import {
  clearSignupVerificationCookie,
  SIGNUP_SETUP_EXPIRED_MESSAGE,
} from '@/src/lib/auth/signupVerification';
import {
  getActiveSignupSessionForEmail,
  getSignupSessionById,
  issueSignupSessionCookie,
  markSignupOtpVerified,
  readSignupSessionCookie,
  signupSessionPublicState,
  submitSignupProfile,
} from '@/src/lib/auth/signupSession';
import { createCustomerSession } from '@/src/lib/auth/session';
import { normaliseEmail } from '@/src/lib/email/address';
import { normaliseIndianPhone } from '@/src/lib/phone';
import { isProfileComplete } from '@/src/services/profile';

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
    // ── Existing complete account: verify OTP and sign in ──
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

    // ── Legacy incomplete account (user row exists, no password) ──
    if (existingCustomer && isIncompleteSignup(existingCustomer)) {
      const verified = await verifyEmailOtp(body.email ?? '', body.code ?? '', otpCtx, {
        consume: true,
      });
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

    // ── New signup: profile step (session only — no user creation) ──
    if (hasProfileFields) {
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
        if (body.code?.trim()) {
          const verified = await verifyEmailOtp(body.email ?? '', body.code, otpCtx, {
            consume: true,
          });
          if (!verified.ok) {
            const message = verified.message.includes('No active code')
              ? SIGNUP_SETUP_EXPIRED_MESSAGE
              : verified.message;
            return NextResponse.json(
              { ok: false, message, needsNewCode: true },
              { status: 400 },
            );
          }
          session = await markSignupOtpVerified(verified.email);
          sessionId = session.id;
        } else {
          return NextResponse.json(
            { ok: false, message: SIGNUP_SETUP_EXPIRED_MESSAGE, needsNewCode: true },
            { status: 400 },
          );
        }
      }

      const updated =
        session.profileSubmitted &&
        session.fullName === fullName &&
        session.phone === phone
          ? session
          : await submitSignupProfile({ sessionId: session.id, fullName, phone });

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

    // ── New signup: OTP step (session only — no user creation) ──
    const pendingSession = await getActiveSignupSessionForEmail(email);
    if (pendingSession?.otpVerified) {
      const cookieSessionId = await readSignupSessionCookie();
      if (cookieSessionId !== pendingSession.id) {
        await issueSignupSessionCookie(pendingSession.id, pendingSession.expiresAt);
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

    const verified = await verifyEmailOtp(body.email ?? '', body.code ?? '', otpCtx, {
      consume: true,
    });
    if (!verified.ok) {
      return NextResponse.json(verified, { status: 400 });
    }

    const session = await markSignupOtpVerified(verified.email);
    await issueSignupSessionCookie(session.id, session.expiresAt);
    await clearSignupVerificationCookie();

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
    return NextResponse.json(
      {
        ok: false,
        message:
          err instanceof Error && err.message
            ? err.message
            : 'We could not finish setting up your account. Please try again.',
        retryable: true,
      },
      { status: 500 },
    );
  }
}

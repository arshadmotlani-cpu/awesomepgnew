import { NextResponse } from 'next/server';
import {
  commitSignupCustomer,
  findCustomerByEmail,
  isAccountComplete,
  setCustomerPassword,
} from '@/src/lib/auth/customer';
import { authLog } from '@/src/lib/auth/authLog';
import { validateCustomerPassword } from '@/src/lib/auth/password';
import {
  completeSignupSession,
  getActiveSignupSessionForEmail,
  readSignupSessionFromRequest,
} from '@/src/lib/auth/signupSession';
import { createCustomerSession, getCustomerSession } from '@/src/lib/auth/session';
import { normaliseEmail } from '@/src/lib/email/address';

export async function POST(request: Request) {
  let body: { password?: string; confirmPassword?: string; email?: string };
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

  const customerSession = await getCustomerSession();
  let signupSession = await readSignupSessionFromRequest();

  if (!signupSession && body.email) {
    const email = normaliseEmail(body.email);
    if (email) {
      signupSession = await getActiveSignupSessionForEmail(email);
    }
  }

  try {
    if (signupSession?.otpVerified && signupSession.profileSubmitted) {
      const existingComplete = await findCustomerByEmail(signupSession.email);
      if (existingComplete && isAccountComplete(existingComplete)) {
        authLog('duplicate_submission_blocked', {
          email: existingComplete.email,
          sessionId: signupSession.id,
          step: 'COMPLETED',
        });
        await completeSignupSession(signupSession.id);
        await createCustomerSession({
          customerId: existingComplete.id,
          ip,
          userAgent,
        });
        return NextResponse.json({
          ok: true,
          email: existingComplete.email,
          mustSetPassword: false,
          alreadySet: true,
        });
      }

      const customer = await commitSignupCustomer({
        email: signupSession.email,
        fullName: signupSession.fullName ?? '',
        phone: signupSession.phone ?? '',
        password,
      });

      await completeSignupSession(signupSession.id);
      await createCustomerSession({
        customerId: customer.id,
        ip,
        userAgent,
      });

      authLog('password_committed', {
        email: customer.email,
        sessionId: signupSession.id,
        step: 'COMPLETED',
      });

      return NextResponse.json({
        ok: true,
        email: customer.email,
        mustSetPassword: false,
      });
    }

    if (customerSession?.mustSetPassword) {
      const existing = await findCustomerByEmail(customerSession.email);
      if (existing && isAccountComplete(existing)) {
        authLog('duplicate_submission_blocked', {
          email: existing.email,
          step: 'COMPLETED',
          source: 'legacy_incomplete',
        });
        return NextResponse.json({
          ok: true,
          email: existing.email,
          mustSetPassword: false,
          alreadySet: true,
        });
      }

      await setCustomerPassword(customerSession.customerId, password);
      authLog('password_committed', {
        email: customerSession.email,
        step: 'COMPLETED',
        source: 'legacy_incomplete',
      });
      return NextResponse.json({
        ok: true,
        email: customerSession.email,
        mustSetPassword: false,
      });
    }

    if (!signupSession) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Signup session expired. Please verify your email and try again.',
          needsSignup: true,
        },
        { status: 401 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        message: 'Complete your profile before creating a password.',
        needsProfile: !signupSession.profileSubmitted,
      },
      { status: 400 },
    );
  } catch (err) {
    console.error('[auth/signup/set-password] failed', {
      email: signupSession?.email ?? customerSession?.email ?? body.email,
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

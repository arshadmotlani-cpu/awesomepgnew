import { NextResponse } from 'next/server';
import { findCustomerByEmail, isAccountComplete, isIncompleteSignup, canSignInWithPassword } from '@/src/lib/auth/customer';
import { authLog } from '@/src/lib/auth/authLog';
import { preferLoginScreen, resolveCustomerAuthSnapshot } from '@/src/lib/auth/resolveCustomerAuthState';
import {
  clearSignupSessionCookie,
  getActiveSignupSessionForEmail,
  readSignupSessionFromRequest,
  resolveSignupStep,
  signupSessionPublicState,
} from '@/src/lib/auth/signupSession';
import { getCustomerSession } from '@/src/lib/auth/session';
import { normaliseEmail } from '@/src/lib/email/address';

function loginFallback(email: string, source: string) {
  return NextResponse.json({
    ok: true,
    source,
    step: 'COMPLETED' as const,
    email,
    needsLogin: true,
  });
}

/** Resume signup — existing complete accounts always route to login. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const emailParam = url.searchParams.get('email');
  const email = emailParam ? normaliseEmail(emailParam) : null;

  const signupSession = await readSignupSessionFromRequest();
  if (signupSession) {
    const customer = await findCustomerByEmail(signupSession.email);
    if (customer && canSignInWithPassword(customer)) {
      await clearSignupSessionCookie();
      return loginFallback(signupSession.email, 'complete_account');
    }

    const snapshot = await resolveCustomerAuthSnapshot(signupSession.email);
    if (preferLoginScreen(snapshot)) {
      await clearSignupSessionCookie();
      authLog('duplicate_submission_blocked', {
        email: signupSession.email,
        sessionId: signupSession.id,
        reason: 'complete_account_overrides_signup_session',
      });
      return loginFallback(signupSession.email, 'complete_account');
    }

    authLog('signup_session_resumed', {
      email: signupSession.email,
      sessionId: signupSession.id,
      step: resolveSignupStep(signupSession),
      source: 'cookie',
    });
    return NextResponse.json({
      ok: true,
      source: 'signup_session',
      ...signupSessionPublicState(signupSession),
      needsProfile: signupSession.otpVerified && !signupSession.profileSubmitted,
      needsPassword: signupSession.profileSubmitted,
      shouldSignup: true,
    });
  }

  if (email) {
    const snapshot = await resolveCustomerAuthSnapshot(email);
    if (snapshot?.kind === 'existing_complete') {
      return loginFallback(email, 'complete_account');
    }

    const active = await getActiveSignupSessionForEmail(email);
    if (active) {
      authLog('signup_session_resumed', {
        email: active.email,
        sessionId: active.id,
        step: resolveSignupStep(active),
        source: 'email_lookup',
      });
      return NextResponse.json({
        ok: true,
        source: 'signup_session',
        ...signupSessionPublicState(active),
        needsProfile: active.otpVerified && !active.profileSubmitted,
        needsPassword: active.profileSubmitted,
        shouldSignup: true,
      });
    }

    const customer = await findCustomerByEmail(email);
    if (customer && isIncompleteSignup(customer)) {
      return NextResponse.json({
        ok: true,
        source: 'legacy_incomplete',
        step: 'PASSWORD',
        email: customer.email,
        needsPassword: true,
        legacyIncomplete: true,
        shouldSignup: true,
      });
    }
  }

  const customerSession = await getCustomerSession();
  if (customerSession?.mustSetPassword) {
    const customer = await findCustomerByEmail(customerSession.email);
    if (customer && isAccountComplete(customer)) {
      return loginFallback(customerSession.email, 'complete_account');
    }
    return NextResponse.json({
      ok: true,
      source: 'customer_session',
      step: 'PASSWORD',
      email: customerSession.email,
      needsPassword: true,
      legacyIncomplete: true,
      shouldSignup: true,
    });
  }

  return NextResponse.json({ ok: false, message: 'No active signup session.', needsLogin: true }, { status: 404 });
}

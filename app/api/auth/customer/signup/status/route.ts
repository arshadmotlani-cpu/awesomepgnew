import { NextResponse } from 'next/server';
import { findCustomerByEmail, isAccountComplete, isIncompleteSignup } from '@/src/lib/auth/customer';
import { authLog } from '@/src/lib/auth/authLog';
import {
  getActiveSignupSessionForEmail,
  readSignupSessionFromRequest,
  resolveSignupStep,
  signupSessionPublicState,
} from '@/src/lib/auth/signupSession';
import { getCustomerSession } from '@/src/lib/auth/session';
import { normaliseEmail } from '@/src/lib/email/address';

/** Resume signup — returns current step without assuming a user exists. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const emailParam = url.searchParams.get('email');
  const email = emailParam ? normaliseEmail(emailParam) : null;

  const signupSession = await readSignupSessionFromRequest();
  if (signupSession) {
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
    });
  }

  if (email) {
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
      });
    }
    if (customer && isAccountComplete(customer)) {
      return NextResponse.json({
        ok: true,
        source: 'complete_account',
        step: 'COMPLETED',
        email: customer.email,
        needsLogin: true,
      });
    }
  }

  const customerSession = await getCustomerSession();
  if (customerSession?.mustSetPassword) {
    return NextResponse.json({
      ok: true,
      source: 'customer_session',
      step: 'PASSWORD',
      email: customerSession.email,
      needsPassword: true,
      legacyIncomplete: true,
    });
  }

  return NextResponse.json({ ok: false, message: 'No active signup session.' }, { status: 404 });
}

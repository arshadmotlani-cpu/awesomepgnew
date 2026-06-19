import { findCustomerByEmail, canSignInWithPassword } from '@/src/lib/auth/customer';
import { clearSignupVerificationCookie } from '@/src/lib/auth/signupVerification';
import {
  clearSignupSessionCookie,
  readSignupSessionFromRequest,
} from '@/src/lib/auth/signupSession';

export type LoginBootstrap = {
  email?: string;
  message?: string;
};

/** Wipe stale signup cookies on plain /login — not on /login?signup=1. */
export async function bootstrapLoginPage(options?: { preserveSignup?: boolean }): Promise<LoginBootstrap> {
  if (options?.preserveSignup) return {};

  const signupSession = await readSignupSessionFromRequest();
  const email = signupSession?.email;

  if (signupSession) {
    await clearSignupSessionCookie();
  }
  await clearSignupVerificationCookie();

  if (!email) return {};

  const customer = await findCustomerByEmail(email);
  if (customer && canSignInWithPassword(customer)) {
    return {
      email: customer.email,
      message: 'You already have an account. Sign in with your password or use Forgot password.',
    };
  }

  return {
    email,
    message: 'Sign in with your password below, or use Forgot password to set one via email code.',
  };
}

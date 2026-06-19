import { clearSignupVerificationCookie } from '@/src/lib/auth/signupVerification';
import { clearSignupSessionCookie } from '@/src/lib/auth/signupSession';

export type LoginBootstrap = {
  email?: string;
  message?: string;
};

/**
 * Plain /login must never depend on signup_sessions DB — missing migration must not brick sign-in.
 * Only clears stale cookies; the form loads with empty fields.
 * On /login?signup=1, cookies are preserved so mid-signup can continue.
 */
export async function bootstrapLoginPage(options?: { preserveSignup?: boolean }): Promise<LoginBootstrap> {
  if (options?.preserveSignup) return {};

  try {
    await clearSignupSessionCookie();
    await clearSignupVerificationCookie();
  } catch (err) {
    console.error('[loginBootstrap] cookie clear failed', err);
  }
  return {};
}

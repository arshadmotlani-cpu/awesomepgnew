import { findCustomerByEmail, canSignInWithPassword } from '@/src/lib/auth/customer';
import {
  clearSignupSessionCookie,
  readSignupSessionFromRequest,
} from '@/src/lib/auth/signupSession';

/** Clear stale signup cookie when the user already has a password (server-side, before UI). */
export async function clearStaleSignupSessionForLogin(): Promise<string | null> {
  const signupSession = await readSignupSessionFromRequest();
  if (!signupSession) return null;

  const customer = await findCustomerByEmail(signupSession.email);
  if (customer && canSignInWithPassword(customer)) {
    await clearSignupSessionCookie();
    return customer.email;
  }

  return signupSession.email;
}

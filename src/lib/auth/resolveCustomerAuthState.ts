import {
  findCustomerByEmail,
  canSignInWithPassword,
  isAccountComplete,
  isIncompleteSignup,
} from '@/src/lib/auth/customer';
import { getActiveSignupSessionForEmail } from '@/src/lib/auth/signupSession';
import { normaliseEmail } from '@/src/lib/email/address';

export type CustomerAuthKind =
  | 'existing_complete'
  | 'existing_incomplete'
  | 'signup_in_progress'
  | 'new';

export type CustomerAuthSnapshot = {
  kind: CustomerAuthKind;
  email: string;
  /** Prefer login screen — complete account exists. */
  shouldLogin: boolean;
  /** Confirmed new signup only — no complete account. */
  shouldSignup: boolean;
};

export async function resolveCustomerAuthSnapshot(
  rawEmail: string,
): Promise<CustomerAuthSnapshot | null> {
  const email = normaliseEmail(rawEmail);
  if (!email) return null;

  const customer = await findCustomerByEmail(email);
  if (customer && !customer.archivedAt && canSignInWithPassword(customer)) {
    return {
      kind: isAccountComplete(customer) ? 'existing_complete' : 'existing_incomplete',
      email: customer.email,
      shouldLogin: true,
      shouldSignup: false,
    };
  }

  if (customer && !customer.archivedAt && isIncompleteSignup(customer)) {
    return {
      kind: 'existing_incomplete',
      email: customer.email,
      shouldLogin: false,
      shouldSignup: true,
    };
  }

  const pendingSignup = await getActiveSignupSessionForEmail(email);
  if (pendingSignup) {
    return {
      kind: 'signup_in_progress',
      email: pendingSignup.email,
      shouldLogin: false,
      shouldSignup: true,
    };
  }

  return {
    kind: 'new',
    email,
    shouldLogin: false,
    shouldSignup: true,
  };
}

/** Ambiguous or any existing password → login. Never force profile for those users. */
export function preferLoginScreen(snapshot: CustomerAuthSnapshot | null): boolean {
  if (!snapshot) return true;
  if (snapshot.shouldLogin) return true;
  return false;
}

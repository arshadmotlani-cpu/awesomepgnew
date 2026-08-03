/**
 * Resident Login / Sign Up copy — single source for forgiving auth UX.
 * Prefer "Login" and "Sign Up" only (never "Sign In").
 */

export const RESIDENT_AUTH_COPY = {
  emptyEmail: 'Please enter your email address.',
  emptyPassword: 'Please enter your password.',
  invalidEmail: 'Please enter a valid email address.',
  incorrectPassword: 'Incorrect password.',
  noAccountExists: 'No account exists with this email.',
  noAccountCreatePrompt: 'Would you like to create one?',
  createAccountCta: 'Create Account',
  welcomeBackTitle: 'Welcome back!',
  welcomeBackBody:
    'An account already exists with this email.\nPlease enter your password to continue.',
  unknownEmailSignupTitle: "We couldn't find an account with this email.",
  unknownEmailSignupBody: "Let's create one.",
  loginFailedGeneric: 'Login failed. Please try again.',
  tooManyAttempts: 'Too many login attempts. Please wait an hour and try again.',
} as const;

export type ResidentAuthNotice = 'welcome_back' | 'no_account' | 'password_changed' | 'signed_out_all';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailFormat(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Client-side email check — do not contact the server when this fails. */
export function validateResidentEmailInput(raw: string): { ok: true; email: string } | { ok: false; message: string } {
  const email = raw.trim();
  if (!email) {
    return { ok: false, message: RESIDENT_AUTH_COPY.emptyEmail };
  }
  if (!isValidEmailFormat(email)) {
    return { ok: false, message: RESIDENT_AUTH_COPY.invalidEmail };
  }
  return { ok: true, email };
}

export function validateResidentPasswordInput(password: string): { ok: true } | { ok: false; message: string } {
  if (!password) {
    return { ok: false, message: RESIDENT_AUTH_COPY.emptyPassword };
  }
  return { ok: true };
}

export function parseResidentAuthNotice(
  raw: string | null | undefined,
): ResidentAuthNotice | null {
  if (
    raw === 'welcome_back' ||
    raw === 'no_account' ||
    raw === 'password_changed' ||
    raw === 'signed_out_all'
  ) {
    return raw;
  }
  return null;
}

export function residentAuthNoticeContent(notice: ResidentAuthNotice): {
  title: string;
  body: string;
  tone: 'info' | 'success';
} {
  switch (notice) {
    case 'welcome_back':
      return {
        title: RESIDENT_AUTH_COPY.welcomeBackTitle,
        body: RESIDENT_AUTH_COPY.welcomeBackBody,
        tone: 'info',
      };
    case 'no_account':
      return {
        title: RESIDENT_AUTH_COPY.unknownEmailSignupTitle,
        body: RESIDENT_AUTH_COPY.unknownEmailSignupBody,
        tone: 'info',
      };
    case 'password_changed':
      return {
        title: 'Password updated',
        body: 'Login with your new password to continue.',
        tone: 'success',
      };
    case 'signed_out_all':
      return {
        title: 'Signed out everywhere',
        body: 'Login again to continue.',
        tone: 'info',
      };
  }
}

/** Build /login query for guided Login ↔ Sign Up handoff. */
export function buildResidentAuthHref(input: {
  signup?: boolean;
  email?: string;
  next?: string;
  notice?: ResidentAuthNotice;
}): string {
  const q = new URLSearchParams();
  if (input.signup) q.set('signup', '1');
  if (input.next) q.set('next', input.next);
  if (input.email?.trim()) q.set('email', input.email.trim());
  if (input.notice) q.set('notice', input.notice);
  const qs = q.toString();
  return qs ? `/login?${qs}` : '/login';
}

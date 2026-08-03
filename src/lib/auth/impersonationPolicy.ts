/** Impersonation resident sessions are short-lived — independent of remember-me TTL. */
export const IMPERSONATION_SESSION_MS = 4 * 60 * 60 * 1000;

export function impersonationSessionExpiry(now = new Date()): Date {
  return new Date(now.getTime() + IMPERSONATION_SESSION_MS);
}

export const IMPERSONATION_BLOCKED_MESSAGE =
  'This action is disabled while viewing as a resident. Return to admin to manage credentials.';

export const IMPERSONATION_DEFAULT_REASON = 'UX Review';

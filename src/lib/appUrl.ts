/**
 * @deprecated Import from `@/src/lib/url` — kept for existing call sites.
 */
import {
  appAbsoluteUrl,
  CANONICAL_PRODUCTION_URL,
  getAppUrl,
} from '@/src/lib/url';

export { CANONICAL_PRODUCTION_URL, appAbsoluteUrl, getAppUrl };

/** @deprecated Use getAppUrl() */
export const getAppBaseUrl = getAppUrl;

/** @deprecated Use getAppUrl() */
export const getPublicCustomerBaseUrl = getAppUrl;

/** Mask an email for display, e.g. `ops@awesomepg.in` → `o**@awesomepg.in`. */
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return '•••';
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (local.length <= 1) return `•@${domain}`;
  return `${local[0]}${'•'.repeat(Math.min(local.length - 1, 3))}@${domain}`;
}

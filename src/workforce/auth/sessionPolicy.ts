import { WORKFORCE_SESSION_TTL_DAYS } from '@/src/hair/lib/auth/constants';
import { sessionExpiryFromNow } from '@/src/lib/auth/sessionSliding';

const MS_PER_DAY = 86_400_000;

/** Staff workforce sessions expire after 30 days (sliding refresh uses same TTL). */
export function workforceSessionMs(): number {
  return WORKFORCE_SESSION_TTL_DAYS * MS_PER_DAY;
}

export function workforceSessionExpiry(now = new Date()): Date {
  return sessionExpiryFromNow(workforceSessionMs(), now);
}

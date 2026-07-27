import { CAPITAL_SESSION_TTL_DAYS } from './constants';
import { shouldSlideSessionExpiry, sessionExpiryFromNow } from '@/src/lib/auth/sessionSliding';

const MS_PER_DAY = 86_400_000;
const REFRESH_THRESHOLD_DAYS = 14;
const REFRESH_MIN_HOURS = 24;

export function capitalSessionMs(): number {
  return CAPITAL_SESSION_TTL_DAYS * MS_PER_DAY;
}

export function capitalSessionExpiry(now = new Date()): Date {
  return sessionExpiryFromNow(capitalSessionMs(), now);
}

export function lastCapitalSessionSlideAt(expiresAt: Date): Date {
  return new Date(expiresAt.getTime() - capitalSessionMs());
}

export function shouldRefreshCapitalSession(expiresAt: Date, now = new Date()): boolean {
  return shouldSlideSessionExpiry({
    expiresAt,
    lastSeenAt: lastCapitalSessionSlideAt(expiresAt),
    refreshThresholdMs: REFRESH_THRESHOLD_DAYS * MS_PER_DAY,
    refreshMinIntervalMs: REFRESH_MIN_HOURS * 3_600_000,
    now,
  });
}

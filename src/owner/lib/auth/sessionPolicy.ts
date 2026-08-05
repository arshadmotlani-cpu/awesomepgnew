import { OWNER_SESSION_TTL_DAYS } from './constants';
import { shouldSlideSessionExpiry, sessionExpiryFromNow } from '@/src/lib/auth/sessionSliding';

const MS_PER_DAY = 86_400_000;
const REFRESH_THRESHOLD_DAYS = 14;
const REFRESH_MIN_HOURS = 24;

export function ownerSessionMs(): number {
  return OWNER_SESSION_TTL_DAYS * MS_PER_DAY;
}

export function ownerSessionExpiry(now = new Date()): Date {
  return sessionExpiryFromNow(ownerSessionMs(), now);
}

export function lastOwnerSessionSlideAt(expiresAt: Date): Date {
  return new Date(expiresAt.getTime() - ownerSessionMs());
}

export function shouldRefreshOwnerSession(expiresAt: Date, now = new Date()): boolean {
  return shouldSlideSessionExpiry({
    expiresAt,
    lastSeenAt: lastOwnerSessionSlideAt(expiresAt),
    refreshThresholdMs: REFRESH_THRESHOLD_DAYS * MS_PER_DAY,
    refreshMinIntervalMs: REFRESH_MIN_HOURS * 3_600_000,
    now,
  });
}

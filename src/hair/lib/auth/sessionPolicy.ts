import {
  HAIR_SESSION_TTL_DAYS,
  HAIR_SESSION_TTL_DAYS_REMEMBER,
} from './constants';
import { shouldSlideSessionExpiry, sessionExpiryFromNow } from '@/src/lib/auth/sessionSliding';

const MS_PER_DAY = 86_400_000;
const REFRESH_THRESHOLD_DAYS = 14;
const REFRESH_MIN_HOURS = 24;

export function hairSessionMs(rememberMe: boolean): number {
  return (rememberMe ? HAIR_SESSION_TTL_DAYS_REMEMBER : HAIR_SESSION_TTL_DAYS) * MS_PER_DAY;
}

export function hairSessionExpiry(rememberMe: boolean, now = new Date()): Date {
  return sessionExpiryFromNow(hairSessionMs(rememberMe), now);
}

export function lastHairSessionSlideAt(expiresAt: Date, rememberMe: boolean): Date {
  return new Date(expiresAt.getTime() - hairSessionMs(rememberMe));
}

export function shouldRefreshHairSession(
  expiresAt: Date,
  rememberMe: boolean,
  now = new Date(),
): boolean {
  return shouldSlideSessionExpiry({
    expiresAt,
    lastSeenAt: lastHairSessionSlideAt(expiresAt, rememberMe),
    refreshThresholdMs: REFRESH_THRESHOLD_DAYS * MS_PER_DAY,
    refreshMinIntervalMs: REFRESH_MIN_HOURS * 3_600_000,
    now,
  });
}

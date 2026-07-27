import { env } from '@/src/lib/env';
import { shouldSlideSessionExpiry } from '@/src/lib/auth/sessionSliding';

/** Standard resident session (without Remember this device). */
export function customerStandardSessionMs(): number {
  return env.AUTH_CUSTOMER_SESSION_DAYS * 86_400_000;
}

/** Remember-this-device resident session. */
export function customerRememberSessionMs(): number {
  return env.AUTH_CUSTOMER_REMEMBER_DAYS * 86_400_000;
}

export function customerSessionMs(rememberMe: boolean): number {
  return rememberMe ? customerRememberSessionMs() : customerStandardSessionMs();
}

/** Extend session when remaining lifetime falls below this threshold. */
export function customerSessionRefreshThresholdMs(): number {
  return env.AUTH_CUSTOMER_SESSION_REFRESH_DAYS * 86_400_000;
}

export function customerSessionRefreshMinIntervalMs(): number {
  return env.AUTH_CUSTOMER_SESSION_REFRESH_MIN_HOURS * 3_600_000;
}

export function shouldRefreshCustomerSession(
  expiresAt: Date,
  lastSeenAt: Date,
  now = new Date(),
): boolean {
  return shouldSlideSessionExpiry({
    expiresAt,
    lastSeenAt,
    refreshThresholdMs: customerSessionRefreshThresholdMs(),
    refreshMinIntervalMs: customerSessionRefreshMinIntervalMs(),
    now,
  });
}

export function customerSessionExpiry(rememberMe: boolean, now = new Date()): Date {
  return new Date(now.getTime() + customerSessionMs(rememberMe));
}

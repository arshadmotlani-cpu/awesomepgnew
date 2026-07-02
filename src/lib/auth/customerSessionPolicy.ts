import { env } from '@/src/lib/env';

/** Standard resident session (without Remember this device). */
export function customerStandardSessionMs(): number {
  return env.AUTH_CUSTOMER_SESSION_DAYS * 86_400_000;
}

/** Remember-this-device resident session (60–90 day window via env). */
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

export function shouldRefreshCustomerSession(expiresAt: Date, now = new Date()): boolean {
  const remaining = expiresAt.getTime() - now.getTime();
  return remaining <= customerSessionRefreshThresholdMs();
}

export function customerSessionExpiry(rememberMe: boolean, now = new Date()): Date {
  return new Date(now.getTime() + customerSessionMs(rememberMe));
}

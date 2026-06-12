import { env } from '@/src/lib/env';

/** Standard admin session length (without Remember Me). */
export function adminStandardSessionMs(): number {
  return env.AUTH_ADMIN_SESSION_DAYS * 86_400_000;
}

/** Remember Me admin session length. */
export function adminRememberSessionMs(): number {
  return env.AUTH_ADMIN_REMEMBER_DAYS * 86_400_000;
}

export function adminSessionMs(rememberMe: boolean): number {
  return rememberMe ? adminRememberSessionMs() : adminStandardSessionMs();
}

/** Extend session when remaining lifetime falls below this threshold. */
export function adminSessionRefreshThresholdMs(): number {
  return env.AUTH_ADMIN_SESSION_REFRESH_DAYS * 86_400_000;
}

export function shouldRefreshAdminSession(expiresAt: Date, now = new Date()): boolean {
  const remaining = expiresAt.getTime() - now.getTime();
  return remaining <= adminSessionRefreshThresholdMs();
}

export function adminSessionExpiry(rememberMe: boolean, now = new Date()): Date {
  return new Date(now.getTime() + adminSessionMs(rememberMe));
}

import { PLATFORM_SESSION_TTL_DAYS, PLATFORM_SESSION_TTL_DAYS_REMEMBER } from './constants';

export function platformSessionExpiry(rememberMe = false): Date {
  const days = rememberMe ? PLATFORM_SESSION_TTL_DAYS_REMEMBER : PLATFORM_SESSION_TTL_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function platformSessionCookieOptions(secure: boolean, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

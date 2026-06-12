export const CUSTOMER_SESSION_COOKIE = 'apg_customer_session';
export const ADMIN_SESSION_COOKIE = 'apg_admin_session';

export const PUBLIC_PATHS = new Set([
  '/',
  '/login',
  '/admin/login',
  '/admin/forgot-password',
  '/admin/reset-password',
  '/pgs',
  '/api/availability',
  '/api/auth/customer/email/send',
  '/api/auth/customer/email/verify',
  '/api/auth/admin/login',
  '/api/auth/admin/forgot-password',
  '/api/auth/admin/reset-password',
  '/api/auth/logout',
]);

export const CUSTOMER_AUTH_PREFIXES = [
  '/booking/',
  '/booking/new',
  '/account/',
] as const;

export const ADMIN_AUTH_PREFIX = '/admin';

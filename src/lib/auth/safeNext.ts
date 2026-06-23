/** Allow only same-origin relative paths for post-login redirects. */
export function safeNext(raw: string | null | undefined, fallback = '/account/bookings'): string {
  const value = (raw ?? '').trim();
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}

/** Admin console redirects must stay under /admin. */
export function safeAdminNext(raw: string | null | undefined, fallback = '/admin'): string {
  const dest = safeNext(raw, fallback);
  return dest.startsWith('/admin') ? dest : fallback;
}

/** Full navigation so Set-Cookie is applied before the next request (mobile Safari). */
export function redirectAfterAuth(url: string): void {
  if (typeof window !== 'undefined') {
    console.info('[auth] redirect_after_auth', JSON.stringify({ next: url }));
  }
  window.location.assign(url);
}

export function profileRedirectWithNext(next: string | null | undefined): string {
  const dest = safeNext(next, '/account/bookings');
  return `/account/profile?next=${encodeURIComponent(dest)}`;
}

/** Allow only same-origin relative paths for post-login redirects. */
export function safeNext(raw: string | null | undefined, fallback = '/account/bookings'): string {
  const value = (raw ?? '').trim();
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}

export function profileRedirectWithNext(next: string | null | undefined): string {
  const dest = safeNext(next, '/account/bookings');
  return `/account/profile?next=${encodeURIComponent(dest)}`;
}

/** Resolve the public hostname from request headers (Vercel-safe). */
export function resolveRequestHostname(
  headerSource: Headers | { get(name: string): string | null },
): string {
  const forwarded = headerSource.get('x-forwarded-host')?.split(',')[0]?.trim() ?? '';
  const host = headerSource.get('host')?.trim() ?? '';
  const raw = forwarded || host;
  return raw.split(':')[0]?.toLowerCase() ?? '';
}

export function isOwnerHost(host: string): boolean {
  const h = host.split(':')[0]?.toLowerCase() ?? '';
  return (
    h === 'owner.awesomepg.in' ||
    h === 'owner.localhost' ||
    h === 'owner.localhost.localdomain' ||
    (process.env.NODE_ENV === 'development' &&
      h === 'localhost' &&
      process.env.OWNER_DEV_HOST === '1')
  );
}

export function isOwnerHostFromHeaders(
  headerSource: Headers | { get(name: string): string | null },
): boolean {
  return isOwnerHost(resolveRequestHostname(headerSource));
}

/** Internal App Router prefix — avoids colliding with Capital/Hair root routes. */
export const OWNER_INTERNAL_PREFIX = '/owner';

/** Public path prefixes on owner.awesomepg.in (browser URLs). */
export const OWNER_PUBLIC_PREFIXES = [
  '/dashboard',
  '/net-worth',
  '/cashflow',
  '/income',
  '/assets',
  '/properties',
  '/liabilities',
  '/expenses',
  '/accounts',
  '/integrations',
  '/investments',
  '/wealth',
  '/settings',
] as const;

export function isOwnerPublicPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/login' || pathname === '/auth/login') return true;
  if (pathname.startsWith('/_next')) return true;
  if (pathname.startsWith('/owner')) return true;
  if (pathname.startsWith('/api/owner')) return true;
  return OWNER_PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isOwnerProtectedPath(pathname: string): boolean {
  if (pathname === '/login' || pathname === '/auth/login') return false;
  if (pathname.startsWith('/owner/auth/login')) return false;
  if (pathname.startsWith('/api/owner/health')) return false;
  if (pathname.startsWith('/owner/')) {
    const rest = pathname.slice(OWNER_INTERNAL_PREFIX.length) || '/';
    if (rest === '/auth/login' || rest.startsWith('/auth/login')) return false;
    return OWNER_PUBLIC_PREFIXES.some((p) => rest === p || rest.startsWith(`${p}/`));
  }
  return OWNER_PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Map public Owner OS URL → internal /owner/... App Router path. */
export function ownerPublicToInternal(pathname: string): string | null {
  if (pathname.startsWith(OWNER_INTERNAL_PREFIX)) return pathname;
  if (pathname === '/login' || pathname === '/auth/login') {
    return `${OWNER_INTERNAL_PREFIX}/auth/login`;
  }
  if (pathname === '/') return null;
  for (const p of OWNER_PUBLIC_PREFIXES) {
    if (pathname === p || pathname.startsWith(`${p}/`)) {
      return `${OWNER_INTERNAL_PREFIX}${pathname}`;
    }
  }
  return null;
}

/** Resolve the public hostname from request headers (Vercel-safe). */
export function resolveRequestHostname(
  headerSource: Headers | { get(name: string): string | null },
): string {
  const forwarded = headerSource.get('x-forwarded-host')?.split(',')[0]?.trim() ?? '';
  const host = headerSource.get('host')?.trim() ?? '';
  const raw = forwarded || host;
  return raw.split(':')[0]?.toLowerCase() ?? '';
}

export function isCapitalHost(host: string): boolean {
  const h = host.split(':')[0]?.toLowerCase() ?? '';
  return (
    h === 'invest.awesomepg.in' ||
    h === 'invest.localhost' ||
    h === 'invest.localhost.localdomain' ||
    (process.env.NODE_ENV === 'development' && h === 'localhost' && process.env.CAPITAL_DEV_HOST === '1')
  );
}

export function isCapitalHostFromHeaders(
  headerSource: Headers | { get(name: string): string | null },
): boolean {
  return isCapitalHost(resolveRequestHostname(headerSource));
}

/** Paths that Capital is allowed to serve on the invest host. Everything else → 404. */
export function isCapitalAllowedPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/login' || pathname === '/auth/login') return true;
  if (pathname.startsWith('/_next')) return true;
  if (pathname.startsWith('/capital/')) return true; // PWA / static capital assets
  if (pathname.startsWith('/api/capital')) return true;
  const prefixes = [
    '/dashboard',
    '/assets',
    '/expenses',
    '/payments',
    '/capital',
    '/ledger',
    '/documents',
    '/reports',
    '/analytics',
    '/settings',
    '/activity',
    '/search',
  ];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isCapitalProtectedPath(pathname: string): boolean {
  if (pathname === '/login' || pathname === '/auth/login') return false;
  if (pathname.startsWith('/api/capital/auth/login')) return false;
  const protectedPrefixes = [
    '/dashboard',
    '/assets',
    '/expenses',
    '/payments',
    '/capital',
    '/ledger',
    '/documents',
    '/reports',
    '/analytics',
    '/settings',
    '/activity',
    '/search',
    '/api/capital',
  ];
  return protectedPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isPgPath(pathname: string): boolean {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/account') ||
    pathname.startsWith('/booking') ||
    pathname.startsWith('/pgs') ||
    pathname.startsWith('/resident') ||
    pathname.startsWith('/reserve') ||
    pathname.startsWith('/i/') ||
    pathname.startsWith('/guide') ||
    pathname.startsWith('/enquiry') ||
    pathname.startsWith('/pay/') ||
    pathname === '/about'
  );
}

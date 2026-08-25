import { isHairTenantSubdomain, parseHairTenantSlug } from '@/src/hair/lib/tenant/subdomainHost';

/** Resolve the public hostname from request headers (Vercel-safe). */
export function resolveRequestHostname(
  headerSource: Headers | { get(name: string): string | null },
): string {
  const forwarded = headerSource.get('x-forwarded-host')?.split(',')[0]?.trim() ?? '';
  const host = headerSource.get('host')?.trim() ?? '';
  const raw = forwarded || host;
  return raw.split(':')[0]?.toLowerCase() ?? '';
}

export function isHairHost(host: string): boolean {
  const h = host.split(':')[0]?.toLowerCase() ?? '';
  if (
    h === 'fyhair.awesomepg.in' ||
    h === 'fyhair.localhost' ||
    h === 'fyhair.localhost.localdomain' ||
    // Legacy alias (kept for compatibility)
    h === 'foryourhair.awesomepg.in' ||
    h === 'foryourhair.localhost' ||
    h === 'foryourhair.localhost.localdomain' ||
    (process.env.NODE_ENV === 'development' &&
      h === 'localhost' &&
      process.env.HAIR_DEV_HOST === '1')
  ) {
    return true;
  }
  // Phase F: {slug}.fyhair.app (and staging parents)
  return isHairTenantSubdomain(h);
}

/** Tenant slug from Host header, or null on apex / non-tenant. */
export function resolveHairTenantSlugFromHeaders(
  headerSource: Headers | { get(name: string): string | null },
): string | null {
  return parseHairTenantSlug(resolveRequestHostname(headerSource));
}

export function isHairHostFromHeaders(
  headerSource: Headers | { get(name: string): string | null },
): boolean {
  return isHairHost(resolveRequestHostname(headerSource));
}

/** Customer-facing paths — no staff session required. */
export const HAIR_PUBLIC_UNPROTECTED_PREFIXES = [
  '/i',
  '/invoice',
  '/salon-software',
  '/brand-concepts',
] as const;

/** Public path prefixes served on the For Your Hair host (browser URLs). */
export const HAIR_PUBLIC_PREFIXES = [
  '/landing',
  '/dashboard',
  '/customers',
  '/appointments',
  '/billing',
  '/quick-sale',
  '/advance-payment',
  '/services',
  '/products',
  '/packages',
  '/memberships',
  '/membership-packages',
  '/inventory',
  '/vendors',
  '/purchases',
  '/expenses',
  '/staff',
  '/workforce',
  '/me',
  '/loyalty',
  '/reports',
  '/settings',
  '/profile',
  '/select-organization',
  '/subscribe',
  '/team',
] as const;

/** Internal App Router prefix — avoids colliding with Automotive Capital routes. */
export const HAIR_INTERNAL_PREFIX = '/fyh';

/**
 * Map Hair auth/app redirects for Preview host (/fyh/* with x-hair-app).
 * On fyhair.* public URLs stay as-is (/login, /dashboard, …).
 */
export async function hairAppRedirect(pathWithQuery: string): Promise<string> {
  const { headers } = await import('next/headers');
  const hdrs = await headers();
  if (isHairHostFromHeaders(hdrs)) return pathWithQuery;
  if (hdrs.get('x-hair-app') !== '1') return pathWithQuery;

  const qIdx = pathWithQuery.indexOf('?');
  const pathname = qIdx >= 0 ? pathWithQuery.slice(0, qIdx) : pathWithQuery;
  const query = qIdx >= 0 ? pathWithQuery.slice(qIdx) : '';
  const mapped = hairPublicToInternal(pathname);
  if (mapped) return mapped + query;
  if (pathname.startsWith(HAIR_INTERNAL_PREFIX)) return pathWithQuery;
  return `${HAIR_INTERNAL_PREFIX}${pathname}${query}`;
}

function isHairPublicInvoicePath(pathname: string): boolean {
  return HAIR_PUBLIC_UNPROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function isHairPublicPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/login' || pathname === '/auth/login') return true;
  if (pathname.startsWith('/_next')) return true;
  if (pathname.startsWith('/fyh')) return true;
  if (pathname.startsWith('/api/hair')) return true;
  if (isHairPublicInvoicePath(pathname)) return true;
  return HAIR_PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Org picker must not require resolved tenant cookies (would loop with /login). */
export function isHairTenantExemptPath(pathname: string): boolean {
  const rest = pathname.startsWith(HAIR_INTERNAL_PREFIX)
    ? pathname.slice(HAIR_INTERNAL_PREFIX.length) || '/'
    : pathname;
  return (
    rest === '/select-organization' ||
    rest.startsWith('/select-organization/') ||
    rest === '/subscribe' ||
    rest.startsWith('/subscribe/')
  );
}

export function isHairProtectedPath(pathname: string): boolean {
  if (pathname === '/login' || pathname === '/auth/login') return false;
  if (pathname.startsWith('/fyh/auth/login')) return false;
  if (pathname.startsWith('/api/hair/auth')) return false;
  if (isHairPublicInvoicePath(pathname)) return false;
  if (pathname.startsWith('/fyh/')) {
    const rest = pathname.slice(HAIR_INTERNAL_PREFIX.length) || '/';
    if (rest === '/auth/login' || rest.startsWith('/auth/login')) return false;
    if (isHairPublicInvoicePath(rest)) return false;
    return HAIR_PUBLIC_PREFIXES.some((p) => rest === p || rest.startsWith(`${p}/`));
  }
  return HAIR_PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Map a public For Your Hair URL to the internal /fyh/... App Router path.
 * Returns null if the path is not a Hair app route.
 */
export function hairPublicToInternal(pathname: string): string | null {
  if (pathname.startsWith(HAIR_INTERNAL_PREFIX)) return pathname;
  if (pathname === '/login' || pathname === '/auth/login') return `${HAIR_INTERNAL_PREFIX}/auth/login`;
  if (pathname === '/') return null; // handled as redirect
  for (const p of HAIR_PUBLIC_UNPROTECTED_PREFIXES) {
    if (pathname === p || pathname.startsWith(`${p}/`)) {
      return `${HAIR_INTERNAL_PREFIX}${pathname}`;
    }
  }
  for (const p of HAIR_PUBLIC_PREFIXES) {
    if (pathname === p || pathname.startsWith(`${p}/`)) {
      return `${HAIR_INTERNAL_PREFIX}${pathname}`;
    }
  }
  if (pathname.startsWith('/api/hair')) return pathname;
  return null;
}

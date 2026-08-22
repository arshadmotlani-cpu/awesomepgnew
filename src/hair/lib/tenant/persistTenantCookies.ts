import { cookies } from 'next/headers';
import { FYH_LOCATION_COOKIE, FYH_ORG_COOKIE } from './cookies';

export function tenantCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  };
}

export async function persistTenantCookies(
  organizationId: string,
  locationId: string,
): Promise<void> {
  const cookieStore = await cookies();
  const opts = tenantCookieOptions();
  cookieStore.set(FYH_ORG_COOKIE, organizationId, opts);
  cookieStore.set(FYH_LOCATION_COOKIE, locationId, opts);
}

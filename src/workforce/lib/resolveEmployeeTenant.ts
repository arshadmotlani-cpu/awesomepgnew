import { getHairSession, type HairSession } from '@/src/hair/lib/auth/session';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import { resolveTenantContext } from '@/src/hair/lib/tenant/resolveTenantContext';

export const NO_ORG_LOCATION_CONFIGURED =
  'Your organization has no active location configured. Please configure a location before creating an employee.';

/** Same priority as resolveTenantContext: session loc → cookie loc → first allowed. */
export function resolveLocationIdForEmployeeCreate(input: {
  sessionLocationId: string | null | undefined;
  cookieLocationId?: string | null;
  allowedLocationIds: string[];
}): string | undefined {
  const allowed = input.allowedLocationIds.filter(Boolean);
  if (input.sessionLocationId && allowed.includes(input.sessionLocationId)) {
    return input.sessionLocationId;
  }
  if (input.cookieLocationId && allowed.includes(input.cookieLocationId)) {
    return input.cookieLocationId;
  }
  return allowed[0];
}

export async function resolveEmployeeCreateTenant(
  session: HairSession | null = null,
): Promise<{ organizationId?: string; locationId?: string }> {
  const resolved = session ?? (await getHairSession());
  if (!resolved) {
    throw new Error('You must be signed in to add employees.');
  }

  if (!isFyhSaasTenantEnabled()) {
    return {
      organizationId: resolved.organizationId || undefined,
      locationId: resolved.locationId || undefined,
    };
  }

  if (!resolved.organizationId) {
    throw new Error('Organization context is missing. Sign in again or contact support.');
  }

  const ctx = await resolveTenantContext();
  const locationId =
    ctx && ctx.organizationId === resolved.organizationId ? ctx.locationId : undefined;

  if (locationId) {
    return { organizationId: resolved.organizationId, locationId };
  }

  throw new Error(NO_ORG_LOCATION_CONFIGURED);
}

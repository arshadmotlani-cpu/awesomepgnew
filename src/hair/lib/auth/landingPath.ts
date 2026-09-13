import { getHairSession } from '@/src/hair/lib/auth/session';
import { resolveDefaultLandingPath } from '@/src/hair/lib/auth/guards';
import type { PermissionAdmin } from '@/src/hair/lib/auth/permissionTypes';
import { resolvePermissions } from '@/src/workforce/brains/employeeBrain';
import { resolveDefaultLandingPathForGrants } from '@/src/workforce/permissions/pagePermissions';

/** Role-aware landing path for the current Hair session (workforce grants or legacy admin). */
export async function resolveSessionDefaultLandingPath(
  admin?: PermissionAdmin | null,
): Promise<string> {
  const session = await getHairSession();
  const resolvedAdmin = admin ?? session?.admin ?? null;

  if (session?.workforceEmployeeId) {
    const grants = await resolvePermissions(session.workforceEmployeeId, 'fyh_salon');
    if (grants) return resolveDefaultLandingPathForGrants(grants);
  }

  if (resolvedAdmin) return resolveDefaultLandingPath(resolvedAdmin);
  return '/login';
}

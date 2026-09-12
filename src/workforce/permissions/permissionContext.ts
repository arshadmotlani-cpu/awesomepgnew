/**
 * Permission context passed to service boundaries after action-level guard passes.
 */

import { getHairSession } from '@/src/hair/lib/auth/session';
import { resolvePermissions } from '@/src/workforce/brains/employeeBrain';
import type { WorkforceEngineId, WorkforcePermissionGrants } from '@/src/workforce/types';
import type { PermissionScope, PermissionSessionContext } from '@/src/workforce/permissions/scope';

export type PermissionContext = {
  grants: WorkforcePermissionGrants;
  session: PermissionSessionContext;
  engineId: WorkforceEngineId;
};

export async function buildPermissionContext(
  engineId: WorkforceEngineId = 'fyh_salon',
): Promise<PermissionContext | null> {
  const session = await getHairSession();
  if (!session?.workforceEmployeeId) return null;

  const grants = await resolvePermissions(session.workforceEmployeeId, engineId);
  return {
    grants,
    engineId,
    session: {
      workforceEmployeeId: session.workforceEmployeeId,
      organizationId: session.organizationId ?? null,
      locationId: session.locationId ?? null,
      accessRole: session.workforceAccessRole ?? null,
    },
  };
}

export type VerifiedPermissionContext = PermissionContext & {
  verifiedPermission: string;
  verifiedScope: PermissionScope;
};

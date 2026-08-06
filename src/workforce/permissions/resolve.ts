import type { WorkforceJobRole, WorkforcePermissionGrants } from '@/src/workforce/types';
import { normalizeAccessRole } from '@/src/workforce/accessRoles';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';
import type { WorkforcePermissionKey } from '@/src/workforce/permissions/library';
import { getRoleTemplateFromDb } from '@/src/workforce/services/roleTemplates';

export type GrantRow = {
  permissions: WorkforcePermissionKey[] | null;
  maxBackdateDays: number | null;
  usesRoleTemplate: boolean;
};

/** Effective permissions = role template OR custom employee override. */
export async function resolveEffectiveGrants(input: {
  engineId: string;
  accessRole: WorkforceJobRole;
  grantRow?: GrantRow | null;
}): Promise<WorkforcePermissionGrants> {
  const role = normalizeAccessRole(input.accessRole);
  const grant = input.grantRow;

  if (grant && !grant.usesRoleTemplate && grant.permissions) {
    return {
      permissions: [...grant.permissions],
      maxBackdateDays: grant.maxBackdateDays,
    };
  }

  const fromDb = await getRoleTemplateFromDb(input.engineId, role);
  if (fromDb) {
    return {
      permissions: [...fromDb.permissions],
      maxBackdateDays:
        grant?.maxBackdateDays !== undefined && grant?.maxBackdateDays !== null
          ? grant.maxBackdateDays
          : fromDb.maxBackdateDays,
    };
  }

  return codeTemplateForAccessRole(role);
}

export function hasWorkforcePermission(
  grants: WorkforcePermissionGrants | null | undefined,
  key: WorkforcePermissionKey,
): boolean {
  if (!grants) return false;
  return grants.permissions.includes(key);
}

export function hasAnyWorkforcePermission(
  grants: WorkforcePermissionGrants | null | undefined,
  keys: WorkforcePermissionKey[],
): boolean {
  return keys.some((k) => hasWorkforcePermission(grants, k));
}

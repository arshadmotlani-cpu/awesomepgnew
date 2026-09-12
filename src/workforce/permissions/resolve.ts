import type { WorkforceJobRole, WorkforcePermissionGrants } from '@/src/workforce/types';
import { normalizeAccessRole } from '@/src/workforce/accessRoles';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';
import type { WorkforcePermissionKey } from '@/src/workforce/permissions/library';
import { permissionSatisfied } from '@/src/workforce/permissions/aliases';
import { getRoleTemplateFromDb } from '@/src/workforce/services/roleTemplates';

export type GrantRow = {
  permissions: WorkforcePermissionKey[] | null;
  maxBackdateDays: number | null;
  maxDiscountPercent?: number | null;
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
      maxDiscountPercent: grant.maxDiscountPercent ?? null,
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
      maxDiscountPercent:
        grant?.maxDiscountPercent !== undefined && grant?.maxDiscountPercent !== null
          ? grant.maxDiscountPercent
          : fromDb.maxDiscountPercent ?? null,
    };
  }

  return codeTemplateForAccessRole(role);
}

export function hasWorkforcePermission(
  grants: WorkforcePermissionGrants | null | undefined,
  key: string,
): boolean {
  if (!grants) return false;
  return permissionSatisfied(grants.permissions, key);
}

export function hasAnyWorkforcePermission(
  grants: WorkforcePermissionGrants | null | undefined,
  keys: WorkforcePermissionKey[],
): boolean {
  return keys.some((k) => hasWorkforcePermission(grants, k));
}

/**
 * Permission scope evaluation — self, own, team, location, org.
 */

import type { WorkforcePermissionGrants } from '@/src/workforce/types';
import { permissionSatisfied } from '@/src/workforce/permissions/aliases';

export type PermissionScope = 'self' | 'own' | 'team' | 'location' | 'org';

export type ScopedResource = {
  type: string;
  id?: string;
  employeeId?: string | null;
  locationId?: string | null;
  createdByEmployeeId?: string | null;
  assignedEmployeeId?: string | null;
};

export type PermissionSessionContext = {
  workforceEmployeeId: string | null;
  organizationId: string | null;
  locationId: string | null;
  accessRole?: string | null;
};

export type ScopeCheckInput = {
  grants: WorkforcePermissionGrants;
  permission: string;
  scope: PermissionScope;
  session: PermissionSessionContext;
  resource?: ScopedResource;
};

/** Permissions that default to self-scope when no explicit org grant exists. */
export const SELF_SCOPED_PERMISSION_PREFIXES = [
  'payroll.own.',
  'attendance.own.',
  'performance.own.',
] as const;

export function isSelfScopedPermission(permission: string): boolean {
  return SELF_SCOPED_PERMISSION_PREFIXES.some((p) => permission.startsWith(p));
}

/**
 * Evaluate whether the session may access a resource at the given scope.
 * Returns true if permission is granted AND scope matches.
 */
export function evaluateScope(input: ScopeCheckInput): boolean {
  const { grants, permission, scope, session, resource } = input;

  if (!permissionSatisfied(grants.permissions, permission)) {
    return false;
  }

  const employeeId = session.workforceEmployeeId;
  if (!employeeId && scope !== 'org') {
    return false;
  }

  switch (scope) {
    case 'org':
      return true;

    case 'location':
      if (!resource?.locationId || !session.locationId) return true;
      return resource.locationId === session.locationId;

    case 'self': {
      const target = resource?.employeeId ?? resource?.id;
      if (!target) return true;
      return target === employeeId;
    }

    case 'own': {
      const owner =
        resource?.assignedEmployeeId ??
        resource?.createdByEmployeeId ??
        resource?.employeeId;
      if (!owner) return true;
      return owner === employeeId;
    }

    case 'team':
      // Phase 1: team = location-scoped until manager hierarchy exists
      if (!resource?.locationId || !session.locationId) return true;
      return resource.locationId === session.locationId;

    default:
      return false;
  }
}

/** Assert self-scope — throws if target is not the authenticated employee. */
export function assertSelfScope(
  session: PermissionSessionContext,
  targetEmployeeId: string,
): void {
  if (!session.workforceEmployeeId || session.workforceEmployeeId !== targetEmployeeId) {
    throw new ScopeViolationError('self', targetEmployeeId);
  }
}

export class ScopeViolationError extends Error {
  readonly scope: PermissionScope;
  readonly targetId: string;

  constructor(scope: PermissionScope, targetId: string) {
    super(`Scope violation: ${scope} access denied for ${targetId}`);
    this.name = 'ScopeViolationError';
    this.scope = scope;
    this.targetId = targetId;
  }
}

/** Filter helper for list endpoints — returns SQL-safe employee filter for self scope. */
export function selfScopeEmployeeId(session: PermissionSessionContext): string | null {
  return session.workforceEmployeeId;
}

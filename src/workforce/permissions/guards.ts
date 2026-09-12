import { redirect } from 'next/navigation';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { requireHairAuth, requireHairAuthPage } from '@/src/hair/lib/auth/guards';
import {
  employeeHasPermission,
  resolvePermissions,
} from '@/src/workforce/brains/employeeBrain';
import { mapLegacyHairPermissions } from '@/src/workforce/permissions/presets';
import { hasWorkforcePermission } from '@/src/workforce/permissions/resolve';
import { permissionSatisfied } from '@/src/workforce/permissions/aliases';
import {
  evaluateScope,
  type PermissionScope,
  type ScopedResource,
  ScopeViolationError,
} from '@/src/workforce/permissions/scope';
import type { WorkforceEngineId, WorkforcePermissionGrants, WorkforcePermissionKey } from '@/src/workforce/types';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';
import type { VerifiedPermissionContext } from '@/src/workforce/permissions/permissionContext';

export class WorkforcePermissionError extends Error {
  readonly code: string;
  readonly permission?: string;

  constructor(message = 'Permission denied', code = 'PERMISSION_DENIED', permission?: string) {
    super(message);
    this.name = 'WorkforcePermissionError';
    this.code = code;
    this.permission = permission;
  }
}

export type FyhPermissionSpec = {
  permission: string;
  scope?: PermissionScope;
  resource?: ScopedResource;
  /** Required discount % ceiling check for quick_sale.discount.apply */
  discountPercent?: number;
};

async function resolveSessionGrants(
  engineId: WorkforceEngineId,
): Promise<{ session: NonNullable<Awaited<ReturnType<typeof getHairSession>>>; grants: WorkforcePermissionGrants }> {
  const session = await getHairSession();
  if (!session) throw new WorkforcePermissionError();

  if (session.admin.role === 'super_admin') {
    const legacyGrants = mapLegacyHairPermissions('super_admin', []);
    return { session, grants: legacyGrants };
  }

  if (!session.workforceEmployeeId) throw new WorkforcePermissionError();
  const grants = await resolvePermissions(session.workforceEmployeeId, engineId);
  if (!grants) throw new WorkforcePermissionError();
  return { session, grants };
}

function checkDiscountConstraint(
  grants: WorkforcePermissionGrants,
  discountPercent?: number,
): void {
  if (discountPercent === undefined) return;
  const max = grants.maxDiscountPercent;
  if (max === null || max === undefined) return;
  if (discountPercent > max) {
    throw new WorkforcePermissionError(
      `Discount ${discountPercent}% exceeds allowed maximum ${max}%`,
      'DISCOUNT_EXCEEDED',
      'quick_sale.discount.apply',
    );
  }
}

/** Canonical permission guard — supports v2 keys, v1 aliases, and scope. */
export async function requireFyhPermission(
  spec: FyhPermissionSpec,
  engineId: WorkforceEngineId = 'fyh_salon',
): Promise<VerifiedPermissionContext> {
  await requireHairAuth();
  const { session, grants } = await resolveSessionGrants(engineId);

  const { permission, scope = 'org', resource, discountPercent } = spec;

  if (!permissionSatisfied(grants.permissions, permission)) {
    throw new WorkforcePermissionError(
      `Missing permission: ${permission}`,
      'PERMISSION_DENIED',
      permission,
    );
  }

  checkDiscountConstraint(grants, discountPercent);

  const scopeOk = evaluateScope({
    grants,
    permission,
    scope,
    session: {
      workforceEmployeeId: session.workforceEmployeeId ?? null,
      organizationId: session.organizationId ?? null,
      locationId: session.locationId ?? null,
    },
    resource,
  });

  if (!scopeOk) {
    throw new ScopeViolationError(scope, resource?.id ?? resource?.employeeId ?? 'unknown');
  }

  return {
    grants,
    engineId,
    verifiedPermission: permission,
    verifiedScope: scope,
    session: {
      workforceEmployeeId: session.workforceEmployeeId ?? null,
      organizationId: session.organizationId ?? null,
      locationId: session.locationId ?? null,
    },
  };
}

export async function requireWorkforcePermission(
  key: WorkforcePermissionKey | string,
  engineId: WorkforceEngineId = 'fyh_salon',
) {
  await requireFyhPermission({ permission: key, scope: 'org' }, engineId);
  const session = await getHairSession();
  if (!session) throw new WorkforcePermissionError();
  return session;
}

export async function requireWorkforcePermissionPage(
  key: WorkforcePermissionKey | string,
  engineId: WorkforceEngineId = 'fyh_salon',
) {
  await requireHairAuthPage();
  try {
    await requireFyhPermission({ permission: key, scope: 'org' }, engineId);
  } catch {
    redirect('/appointments');
  }
  const session = await getHairSession();
  if (!session) redirect('/login');
  return session;
}

export async function getSessionGrants(engineId: WorkforceEngineId = 'fyh_salon') {
  const session = await getHairSession();
  if (!session?.workforceEmployeeId) return null;
  return resolvePermissions(session.workforceEmployeeId, engineId);
}

export async function sessionHasPermission(
  key: string,
  engineId: WorkforceEngineId = 'fyh_salon',
): Promise<boolean> {
  if (!isWorkforceEngineEnabled()) return false;
  const session = await getHairSession();
  if (!session) return false;

  if (session.admin.role === 'super_admin') {
    const legacyGrants = mapLegacyHairPermissions('super_admin', []);
    return hasWorkforcePermission(legacyGrants, key);
  }

  if (!session.workforceEmployeeId) return false;
  return employeeHasPermission(session.workforceEmployeeId, engineId, key as WorkforcePermissionKey);
}

/** Bridge legacy Hair permission checks through workforce resolver when available. */
export async function sessionHasLegacyOrWorkforcePermission(
  legacyKey: string,
  v2Keys: string[],
  engineId: WorkforceEngineId = 'fyh_salon',
): Promise<boolean> {
  const session = await getHairSession();
  if (!session) return false;

  if (session.admin.role === 'super_admin') return true;

  const grants = session.workforceEmployeeId
    ? await resolvePermissions(session.workforceEmployeeId, engineId)
    : null;

  if (grants) {
    return v2Keys.some((k) => permissionSatisfied(grants.permissions, k));
  }

  const { hasPermission } = await import('@/src/hair/lib/auth/permissionTypes');
  return hasPermission(session.admin, legacyKey as import('@/src/hair/lib/auth/permissionTypes').HairPermission);
}

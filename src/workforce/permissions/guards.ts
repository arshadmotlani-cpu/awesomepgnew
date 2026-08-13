import { redirect } from 'next/navigation';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { requireHairAuth, requireHairAuthPage } from '@/src/hair/lib/auth/guards';
import {
  employeeHasPermission,
  resolvePermissions,
} from '@/src/workforce/brains/employeeBrain';
import { mapLegacyHairPermissions } from '@/src/workforce/permissions/presets';
import { hasWorkforcePermission } from '@/src/workforce/permissions/resolve';
import type { WorkforceEngineId, WorkforcePermissionKey } from '@/src/workforce/types';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';

export class WorkforcePermissionError extends Error {
  constructor(message = 'Permission denied') {
    super(message);
    this.name = 'WorkforcePermissionError';
  }
}

export async function requireWorkforcePermission(
  key: WorkforcePermissionKey,
  engineId: WorkforceEngineId = 'fyh_salon',
) {
  await requireHairAuth();
  const session = await getHairSession();
  if (!session) throw new WorkforcePermissionError();

  // Legacy FYH ecosystem administrator — owner-equivalent workforce permissions.
  if (session.admin.role === 'super_admin') {
    const legacyGrants = mapLegacyHairPermissions('super_admin', []);
    const allowed = hasWorkforcePermission(legacyGrants, key);
    if (allowed) return session;
    throw new WorkforcePermissionError(`Missing permission: ${key}`);
  }

  if (!session.workforceEmployeeId) throw new WorkforcePermissionError();
  const ok = await employeeHasPermission(session.workforceEmployeeId, engineId, key);
  if (!ok) throw new WorkforcePermissionError(`Missing permission: ${key}`);
  return session;
}

export async function requireWorkforcePermissionPage(
  key: WorkforcePermissionKey,
  engineId: WorkforceEngineId = 'fyh_salon',
) {
  await requireHairAuthPage();
  const session = await getHairSession();
  if (!session) redirect('/login');

  if (session.admin.role === 'super_admin') {
    const legacyGrants = mapLegacyHairPermissions('super_admin', []);
    if (hasWorkforcePermission(legacyGrants, key)) return session;
    redirect('/appointments');
  }

  if (!session.workforceEmployeeId) redirect('/login');
  const ok = await employeeHasPermission(session.workforceEmployeeId, engineId, key);
  if (!ok) redirect('/appointments');
  return session;
}

export async function getSessionGrants(engineId: WorkforceEngineId = 'fyh_salon') {
  const session = await getHairSession();
  if (!session?.workforceEmployeeId) return null;
  return resolvePermissions(session.workforceEmployeeId, engineId);
}

export async function sessionHasPermission(
  key: WorkforcePermissionKey,
  engineId: WorkforceEngineId = 'fyh_salon',
): Promise<boolean> {
  if (!isWorkforceEngineEnabled()) return false;
  const session = await getHairSession();
  if (!session?.workforceEmployeeId) return false;
  return employeeHasPermission(session.workforceEmployeeId, engineId, key);
}

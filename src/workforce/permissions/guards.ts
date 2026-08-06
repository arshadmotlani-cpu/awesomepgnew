import { redirect } from 'next/navigation';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { requireHairAuth, requireHairAuthPage } from '@/src/hair/lib/auth/guards';
import {
  employeeHasPermission,
  resolvePermissions,
} from '@/src/workforce/brains/employeeBrain';
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
  if (!session?.workforceEmployeeId) throw new WorkforcePermissionError();
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
  if (!session?.workforceEmployeeId) redirect('/login');
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

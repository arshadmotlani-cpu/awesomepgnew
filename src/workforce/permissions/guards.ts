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

  // #region agent log
  fetch('http://127.0.0.1:7596/ingest/7ac86f2a-cbab-4d25-8804-7532d754a1bb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '1ba764' },
    body: JSON.stringify({
      sessionId: '1ba764',
      runId: 'staff-add-auth',
      hypothesisId: 'H1',
      location: 'guards.ts:requireWorkforcePermission',
      message: 'auth check entry',
      data: {
        key,
        adminRole: session.admin.role,
        hasWorkforceEmployeeId: Boolean(session.workforceEmployeeId),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  // Legacy FYH ecosystem administrator — owner-equivalent workforce permissions.
  if (session.admin.role === 'super_admin') {
    const legacyGrants = mapLegacyHairPermissions('super_admin', []);
    const allowed = hasWorkforcePermission(legacyGrants, key);
    // #region agent log
    fetch('http://127.0.0.1:7596/ingest/7ac86f2a-cbab-4d25-8804-7532d754a1bb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '1ba764' },
      body: JSON.stringify({
        sessionId: '1ba764',
        runId: 'staff-add-auth',
        hypothesisId: 'H1',
        location: 'guards.ts:requireWorkforcePermission',
        message: 'super_admin legacy grant check',
        data: { key, allowed },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (allowed) return session;
    throw new WorkforcePermissionError(`Missing permission: ${key}`);
  }

  if (!session.workforceEmployeeId) {
    // #region agent log
    fetch('http://127.0.0.1:7596/ingest/7ac86f2a-cbab-4d25-8804-7532d754a1bb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '1ba764' },
      body: JSON.stringify({
        sessionId: '1ba764',
        runId: 'staff-add-auth',
        hypothesisId: 'H1',
        location: 'guards.ts:requireWorkforcePermission',
        message: 'denied — no workforce employee id',
        data: { key, adminRole: session.admin.role },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw new WorkforcePermissionError();
  }
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

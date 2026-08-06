'use server';

import { revalidatePath } from 'next/cache';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { requireWorkforcePermission } from '@/src/workforce/permissions/guards';
import { listEmployeesForEngine } from '@/src/workforce/brains/employeeBrain';
import {
  ensureRoleTemplatesSeeded,
  listRoleTemplates,
  upsertRoleTemplate,
} from '@/src/workforce/services/roleTemplates';
import { resetEmployeePermissionsToRoleTemplate, updateEmployee } from '@/src/workforce/services/employees';
import { WORKFORCE_ACCESS_ROLES, type WorkforceJobRole } from '@/src/workforce/types';
import { WORKFORCE_PERMISSION_KEYS, type WorkforcePermissionKey } from '@/src/workforce/types';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';

export type PermissionActionState = { error?: string; success?: string };

function parsePermissions(formData: FormData): WorkforcePermissionKey[] {
  return formData
    .getAll('permissions')
    .map(String)
    .filter((k) => (WORKFORCE_PERMISSION_KEYS as readonly string[]).includes(k)) as WorkforcePermissionKey[];
}

export async function loadPermissionManagementData() {
  await requireWorkforcePermission('permissions.manage');
  await ensureRoleTemplatesSeeded('fyh_salon');
  const templates = await listRoleTemplates('fyh_salon');
  const employees = await listEmployeesForEngine('fyh_salon', { activeOnly: false });
  return { templates, employees };
}

export async function updateRoleTemplateAction(
  _prev: PermissionActionState,
  formData: FormData,
): Promise<PermissionActionState> {
  try {
    await requireWorkforcePermission('permissions.manage');
    const accessRole = String(formData.get('accessRole') ?? '') as WorkforceJobRole;
    if (!(WORKFORCE_ACCESS_ROLES as readonly string[]).includes(accessRole)) {
      return { error: 'Invalid access role.' };
    }
    const permissions = parsePermissions(formData);
    const backdateRaw = String(formData.get('maxBackdateDays') ?? '').trim();
    const maxBackdateDays =
      backdateRaw === '' || backdateRaw === 'unlimited'
        ? accessRole === 'owner'
          ? null
          : 0
        : Number(backdateRaw);

    await upsertRoleTemplate({
      engineId: 'fyh_salon',
      accessRole,
      permissions,
      maxBackdateDays,
    });
    revalidatePath('/settings/permissions');
    return { success: `Updated ${accessRole} template.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update template' };
  }
}

export async function resetRoleTemplateAction(
  _prev: PermissionActionState,
  formData: FormData,
): Promise<PermissionActionState> {
  try {
    await requireWorkforcePermission('permissions.manage');
    const accessRole = String(formData.get('accessRole') ?? '') as WorkforceJobRole;
    const tpl = codeTemplateForAccessRole(accessRole);
    await upsertRoleTemplate({
      engineId: 'fyh_salon',
      accessRole,
      permissions: tpl.permissions,
      maxBackdateDays: tpl.maxBackdateDays,
    });
    revalidatePath('/settings/permissions');
    return { success: `Reset ${accessRole} template to factory defaults.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to reset template' };
  }
}

export async function updateEmployeePermissionsAction(
  _prev: PermissionActionState,
  formData: FormData,
): Promise<PermissionActionState> {
  try {
    await requireWorkforcePermission('permissions.manage');
    const session = await getHairSession();
    const employeeId = String(formData.get('employeeId') ?? '').trim();
    if (!employeeId) return { error: 'Missing employee.' };
    const permissions = parsePermissions(formData);
    await updateEmployee(employeeId, {
      permissions,
      actorEmployeeId: session?.workforceEmployeeId ?? null,
    });
    revalidatePath('/settings/permissions');
    revalidatePath('/staff');
    return { success: 'Employee permissions updated.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update employee permissions' };
  }
}

export async function resetEmployeePermissionsAction(
  _prev: PermissionActionState,
  formData: FormData,
): Promise<PermissionActionState> {
  try {
    await requireWorkforcePermission('permissions.manage');
    const session = await getHairSession();
    const employeeId = String(formData.get('employeeId') ?? '').trim();
    if (!employeeId) return { error: 'Missing employee.' };
    await resetEmployeePermissionsToRoleTemplate(
      employeeId,
      'fyh_salon',
      session?.workforceEmployeeId ?? null,
    );
    revalidatePath('/settings/permissions');
    revalidatePath('/staff');
    return { success: 'Employee reset to role template.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to reset employee permissions' };
  }
}

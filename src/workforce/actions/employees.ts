'use server';

import { revalidatePath } from 'next/cache';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { createEmployee, updateEmployee } from '@/src/workforce/services/employees';
import { requireWorkforcePermission } from '@/src/workforce/permissions/guards';
import {
  isWorkforceEngineEnabled,
  WORKFORCE_ACCESS_ROLES,
  type WorkforceJobRole,
} from '@/src/workforce/types';
import { WORKFORCE_PERMISSION_KEYS, type WorkforcePermissionKey } from '@/src/workforce/types';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';

export type WorkforceActionState = { error?: string; success?: string };

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function parseAccessRole(raw: string): WorkforceJobRole {
  const value = raw || 'staff';
  if ((WORKFORCE_ACCESS_ROLES as readonly string[]).includes(value)) {
    return value as WorkforceJobRole;
  }
  return 'staff';
}

export async function createWorkforceEmployeeAction(
  _prev: WorkforceActionState,
  formData: FormData,
): Promise<WorkforceActionState> {
  try {
    if (!isWorkforceEngineEnabled()) return { error: 'Workforce Engine is not enabled.' };
    await requireWorkforcePermission('staff.add');
    const session = await getHairSession();
    const accessRole = parseAccessRole(formStr(formData, 'accessRole'));
    const password = formStr(formData, 'password');
    const receiveBookings = formData.get('receiveBookings') === '1';

    const advancedPerms = formData
      .getAll('permissions')
      .map(String)
      .filter((k) => (WORKFORCE_PERMISSION_KEYS as readonly string[]).includes(k)) as WorkforcePermissionKey[];

    const template = codeTemplateForAccessRole(accessRole);
    const permissions = advancedPerms.length ? advancedPerms : undefined;
    const maxBackdateDays = template.maxBackdateDays;

    const email = formStr(formData, 'email');
    if (!email) return { error: 'Email address is required.' };

    if (password && password.length > 0 && password.length < 6) {
      return { error: 'Password must be at least 6 characters.' };
    }

    await createEmployee({
      fullName: formStr(formData, 'fullName'),
      email,
      mobile: formStr(formData, 'mobile') || null,
      password: password || null,
      gender: (formStr(formData, 'gender') || 'unspecified') as 'unspecified',
      emergencyContact: formStr(formData, 'emergencyContact') || null,
      joiningDate: formStr(formData, 'joiningDate') || null,
      aadhaarNumber: formStr(formData, 'aadhaarNumber') || null,
      panNumber: formStr(formData, 'panNumber') || null,
      salaryPaise: Math.round(Number(formStr(formData, 'salaryInr') || '0') * 100),
      upiId: formStr(formData, 'upiId') || null,
      qrCodeUrl: formStr(formData, 'qrCodeUrl') || null,
      photoUrl: formStr(formData, 'photoUrl') || null,
      status: formStr(formData, 'status') === 'inactive' ? 'inactive' : 'active',
      accessRole,
      permissions,
      maxBackdateDays,
      receiveBookings,
      canLogin: password.length >= 6,
      actorEmployeeId: session?.workforceEmployeeId ?? null,
    });

    revalidatePath('/workforce');
    revalidatePath('/staff');
    revalidatePath('/appointments');
    return { success: 'Employee created.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to create employee' };
  }
}

export async function updateWorkforceEmployeeAction(
  _prev: WorkforceActionState,
  formData: FormData,
): Promise<WorkforceActionState> {
  try {
    if (!isWorkforceEngineEnabled()) return { error: 'Workforce Engine is not enabled.' };
    await requireWorkforcePermission('staff.edit');
    const session = await getHairSession();
    const id = formStr(formData, 'employeeId');
    if (!id) return { error: 'Missing employee' };

    const accessRole = parseAccessRole(formStr(formData, 'accessRole'));
    const perms = formData
      .getAll('permissions')
      .map(String)
      .filter((k) => (WORKFORCE_PERMISSION_KEYS as readonly string[]).includes(k)) as WorkforcePermissionKey[];
    const template = codeTemplateForAccessRole(accessRole);
    const password = formStr(formData, 'password');

    await updateEmployee(id, {
      fullName: formStr(formData, 'fullName') || undefined,
      email: formStr(formData, 'email') || null,
      mobile: formStr(formData, 'mobile') || null,
      password: password || null,
      gender: (formStr(formData, 'gender') || undefined) as 'unspecified' | undefined,
      emergencyContact: formStr(formData, 'emergencyContact') || null,
      joiningDate: formStr(formData, 'joiningDate') || null,
      aadhaarNumber: formStr(formData, 'aadhaarNumber') || null,
      panNumber: formStr(formData, 'panNumber') || null,
      salaryPaise: formStr(formData, 'salaryInr')
        ? Math.round(Number(formStr(formData, 'salaryInr')) * 100)
        : undefined,
      upiId: formStr(formData, 'upiId') || null,
      status: formStr(formData, 'status') === 'inactive' ? 'inactive' : 'active',
      accessRole,
      permissions: perms.length ? perms : undefined,
      maxBackdateDays: template.maxBackdateDays,
      canLogin: password.length >= 6,
      actorEmployeeId: session?.workforceEmployeeId ?? null,
    });

    revalidatePath('/workforce');
    revalidatePath('/staff');
    return { success: 'Employee updated.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update employee' };
  }
}

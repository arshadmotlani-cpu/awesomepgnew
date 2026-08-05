'use server';

import { revalidatePath } from 'next/cache';
import { requireHairAuth } from '@/src/hair/lib/auth/guards';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { createEmployee, updateEmployee } from '@/src/workforce/services/employees';
import { isWorkforceEngineEnabled, type WorkforceJobRole, type WorkforceRank } from '@/src/workforce/types';
import { WORKFORCE_PERMISSION_KEYS, type WorkforcePermissionKey } from '@/src/workforce/types';

export type WorkforceActionState = { error?: string; success?: string };

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

export async function createWorkforceEmployeeAction(
  _prev: WorkforceActionState,
  formData: FormData,
): Promise<WorkforceActionState> {
  try {
    if (!isWorkforceEngineEnabled()) return { error: 'Workforce Engine is not enabled.' };
    await requireHairAuth();
    const session = await getHairSession();
    const rank = (formStr(formData, 'rank') || 'team_member') as WorkforceRank;
    const jobRole = (formStr(formData, 'jobRole') || 'stylist') as WorkforceJobRole;
    const perms = formData.getAll('permissions').map(String).filter((k) =>
      (WORKFORCE_PERMISSION_KEYS as readonly string[]).includes(k),
    ) as WorkforcePermissionKey[];
    const backdateRaw = formStr(formData, 'maxBackdateDays');
    const maxBackdateDays =
      backdateRaw === '' || backdateRaw === 'unlimited'
        ? rank === 'owner'
          ? null
          : 0
        : Number(backdateRaw);

    await createEmployee({
      fullName: formStr(formData, 'fullName'),
      mobile: formStr(formData, 'mobile') || null,
      password: formStr(formData, 'password') || null,
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
      rank,
      jobRole,
      permissions: perms.length ? perms : undefined,
      maxBackdateDays,
      canLogin: Boolean(formStr(formData, 'password')),
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
    await requireHairAuth();
    const session = await getHairSession();
    const id = formStr(formData, 'employeeId');
    if (!id) return { error: 'Missing employee' };

    const rank = (formStr(formData, 'rank') || 'team_member') as WorkforceRank;
    const jobRole = (formStr(formData, 'jobRole') || 'stylist') as WorkforceJobRole;
    const perms = formData.getAll('permissions').map(String).filter((k) =>
      (WORKFORCE_PERMISSION_KEYS as readonly string[]).includes(k),
    ) as WorkforcePermissionKey[];
    const backdateRaw = formStr(formData, 'maxBackdateDays');
    const maxBackdateDays =
      backdateRaw === '' || backdateRaw === 'unlimited'
        ? rank === 'owner'
          ? null
          : 0
        : Number(backdateRaw);

    await updateEmployee(id, {
      fullName: formStr(formData, 'fullName') || undefined,
      mobile: formStr(formData, 'mobile') || null,
      password: formStr(formData, 'password') || null,
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
      rank,
      jobRole,
      permissions: perms.length ? perms : undefined,
      maxBackdateDays,
      actorEmployeeId: session?.workforceEmployeeId ?? null,
    });

    revalidatePath('/workforce');
    revalidatePath('/staff');
    return { success: 'Employee updated.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update employee' };
  }
}

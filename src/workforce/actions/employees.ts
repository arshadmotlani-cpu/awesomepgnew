'use server';

import { revalidatePath } from 'next/cache';
import { requireHairAuth } from '@/src/hair/lib/auth/guards';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { createEmployee, updateEmployee } from '@/src/workforce/services/employees';
import {
  isWorkforceEngineEnabled,
  WORKFORCE_ACCESS_ROLES,
  type WorkforceJobRole,
} from '@/src/workforce/types';
import { WORKFORCE_PERMISSION_KEYS, type WorkforcePermissionKey } from '@/src/workforce/types';
import { defaultGrantsForAccessRole } from '@/src/workforce/permissions/presets';

export type WorkforceActionState = { error?: string; success?: string };

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function parseAccessRole(raw: string): WorkforceJobRole {
  const value = raw || 'stylist';
  if ((WORKFORCE_ACCESS_ROLES as readonly string[]).includes(value)) {
    return value as WorkforceJobRole;
  }
  return 'stylist';
}

export async function createWorkforceEmployeeAction(
  _prev: WorkforceActionState,
  formData: FormData,
): Promise<WorkforceActionState> {
  try {
    if (!isWorkforceEngineEnabled()) return { error: 'Workforce Engine is not enabled.' };
    await requireHairAuth();
    const session = await getHairSession();

    const accessRole = parseAccessRole(formStr(formData, 'accessRole'));
    const loginEnabled = formData.get('loginEnabled') === '1';
    const password = formStr(formData, 'password');

    const perms = formData
      .getAll('permissions')
      .map(String)
      .filter((k) => (WORKFORCE_PERMISSION_KEYS as readonly string[]).includes(k)) as WorkforcePermissionKey[];

    const receiveBookings = formData.get('receiveBookings') === '1';
    let permissions: WorkforcePermissionKey[] | undefined = perms.length ? [...perms] : undefined;
    if (!permissions) {
      permissions = [...defaultGrantsForAccessRole(accessRole).permissions];
    }
    const withoutReceive = permissions.filter((k) => k !== 'appointments.receive_bookings');
    permissions = receiveBookings
      ? [...withoutReceive, 'appointments.receive_bookings']
      : withoutReceive;

    const backdateRaw = formStr(formData, 'maxBackdateDays');
    const maxBackdateDays =
      backdateRaw === '' || backdateRaw === 'unlimited'
        ? accessRole === 'owner'
          ? null
          : 0
        : Number(backdateRaw);

    if (loginEnabled && password.length < 6) {
      return { error: 'Password is required (min 6 characters) when login is enabled.' };
    }

    const email = formStr(formData, 'email');
    if (!email) return { error: 'Email address is required.' };

    await createEmployee({
      fullName: formStr(formData, 'fullName'),
      email,
      mobile: formStr(formData, 'mobile') || null,
      password: loginEnabled ? password : null,
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
      canLogin: loginEnabled,
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

    const accessRole = parseAccessRole(formStr(formData, 'accessRole'));
    const perms = formData
      .getAll('permissions')
      .map(String)
      .filter((k) => (WORKFORCE_PERMISSION_KEYS as readonly string[]).includes(k)) as WorkforcePermissionKey[];
    const backdateRaw = formStr(formData, 'maxBackdateDays');
    const maxBackdateDays =
      backdateRaw === '' || backdateRaw === 'unlimited'
        ? accessRole === 'owner'
          ? null
          : 0
        : Number(backdateRaw);

    const loginEnabled = formData.get('loginEnabled') === '1';
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
      maxBackdateDays,
      canLogin: loginEnabled,
      actorEmployeeId: session?.workforceEmployeeId ?? null,
    });

    revalidatePath('/workforce');
    revalidatePath('/staff');
    return { success: 'Employee updated.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update employee' };
  }
}

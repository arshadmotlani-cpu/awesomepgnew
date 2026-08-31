'use server';

import { revalidatePath } from 'next/cache';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { getEmployeeDashboard } from '@/src/workforce/brains/employeeBrain';
import { createEmployee, updateEmployee } from '@/src/workforce/services/employees';
import { getIncentivePlan } from '@/src/workforce/services/incentivePlans';
import { requireWorkforcePermission } from '@/src/workforce/permissions/guards';
import {
  logWorkforceEmployeeDbError,
  sanitizeWorkforceEmployeeError,
} from '@/src/workforce/lib/workforceDbError';
import {
  persistEmployeeQrCodeUrl,
  persistEmployeeQrFromFile,
} from '@/src/workforce/lib/persistEmployeeQr';
import {
  isWorkforceEngineEnabled,
  WORKFORCE_ACCESS_ROLES,
  type WorkforceJobRole,
} from '@/src/workforce/types';
import { WORKFORCE_PERMISSION_KEYS, type WorkforcePermissionKey } from '@/src/workforce/types';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';
import { parseHrFieldsFromForm, parseScheduleDaysFromForm } from '@/src/workforce/actions/parseHrForm';
import {
  reconcileScheduleWithWeekOff,
  validateScheduleDays,
} from '@/src/workforce/lib/scheduleEditor';
import {
  isIncentivePlanActive,
  normalizeIncentivePlan,
} from '@/src/workforce/lib/incentiveRuleEngine';
import { resolveEmployeeCreateTenant } from '@/src/workforce/lib/resolveEmployeeTenant';

export type WorkforceActionState = { error?: string; success?: string; employeeId?: string };

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

async function resolveQrCodeUrlFromForm(formData: FormData): Promise<string | null> {
  const file = formData.get('qrCodeFile');
  if (file instanceof File && file.size > 0) {
    return persistEmployeeQrFromFile(file);
  }
  const legacy = formStr(formData, 'qrCodeUrl');
  if (legacy) return persistEmployeeQrCodeUrl(legacy);
  return null;
}

export async function createWorkforceEmployeeAction(
  _prev: WorkforceActionState,
  formData: FormData,
): Promise<WorkforceActionState> {
  try {
    if (!isWorkforceEngineEnabled()) return { error: 'Workforce Engine is not enabled.' };
    const session = await requireWorkforcePermission('staff.add');
    const tenant = await resolveEmployeeCreateTenant(session);
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

    const sessionDash = session?.workforceEmployeeId
      ? await getEmployeeDashboard(session.workforceEmployeeId, 'fyh_salon')
      : null;
    const viewerIsOwner =
      session?.admin.role === 'super_admin' ||
      sessionDash?.membership?.jobRole === 'owner';

    const hr = parseHrFieldsFromForm(formData, {
      canToggleIncentive: viewerIsOwner,
      defaultIncentiveEnabled: true,
    });
    const scheduleDays = reconcileScheduleWithWeekOff(
      parseScheduleDaysFromForm(formData),
      hr.weekOffDays,
    );
    validateScheduleDays(scheduleDays);

    const qrCodeUrl = await resolveQrCodeUrlFromForm(formData);

    const emp = await createEmployee({
      fullName: formStr(formData, 'fullName'),
      email,
      mobile: formStr(formData, 'mobile') || null,
      password: password || null,
      gender: (formStr(formData, 'gender') || 'unspecified') as 'unspecified',
      emergencyContact: formStr(formData, 'emergencyContact') || null,
      joiningDate: formStr(formData, 'joiningDate') || null,
      aadhaarNumber: formStr(formData, 'aadhaarNumber') || null,
      panNumber: formStr(formData, 'panNumber') || null,
      photoUrl: formStr(formData, 'photoUrl') || null,
      status: formStr(formData, 'status') === 'inactive' ? 'inactive' : 'active',
      accessRole,
      permissions,
      maxBackdateDays,
      receiveBookings,
      canLogin: password.length >= 6,
      actorEmployeeId: session.workforceEmployeeId ?? null,
      organizationId: tenant.organizationId,
      locationId: tenant.locationId,
      ...hr.employee,
      qrCodeUrl,
      salaryPaise: hr.employee.salaryPaise ?? 0,
      weekOffDays: hr.weekOffDays,
      scheduleDays,
      incentivePlan: hr.incentivePlan,
    });

    revalidatePath('/workforce');
    revalidatePath('/staff');
    revalidatePath('/appointments');
    return { success: 'Employee created.', employeeId: emp.id };
  } catch (e) {
    logWorkforceEmployeeDbError('createWorkforceEmployeeAction', e);
    return { error: sanitizeWorkforceEmployeeError(e) };
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
    const receiveBookings = formData.get('receiveBookings') === '1';

    const existingPlan = await getIncentivePlan(id, 'fyh_salon');
    const sessionDash = session?.workforceEmployeeId
      ? await getEmployeeDashboard(session.workforceEmployeeId, 'fyh_salon')
      : null;
    const viewerIsOwner =
      session?.admin.role === 'super_admin' ||
      sessionDash?.membership?.jobRole === 'owner';

    const existingNormalized = existingPlan
      ? normalizeIncentivePlan(existingPlan.planType, existingPlan.config)
      : null;

    const hr = parseHrFieldsFromForm(formData, {
      canToggleIncentive: viewerIsOwner,
      defaultIncentiveEnabled: existingPlan
        ? isIncentivePlanActive(existingPlan.planType, existingPlan.config)
        : true,
      existingIncentiveConfig: existingNormalized,
    });

    const section = formStr(formData, 'saveSection');
    let scheduleDays;
    if (section === 'schedule') {
      scheduleDays = reconcileScheduleWithWeekOff(
        parseScheduleDaysFromForm(formData),
        hr.weekOffDays,
      );
      validateScheduleDays(scheduleDays);
    }

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
      status: formStr(formData, 'status') === 'inactive' ? 'inactive' : 'active',
      accessRole,
      permissions: perms.length ? perms : undefined,
      maxBackdateDays: template.maxBackdateDays,
      receiveBookings,
      canLogin: password.length >= 6,
      actorEmployeeId: session?.workforceEmployeeId ?? null,
      ...hr.employee,
      qrCodeUrl: (await resolveQrCodeUrlFromForm(formData)) ?? undefined,
      weekOffDays: section === 'schedule' ? hr.weekOffDays : undefined,
      scheduleDays,
      incentivePlan: hr.incentivePlan,
    });

    revalidatePath('/workforce');
    revalidatePath('/staff');
    revalidatePath(`/staff/${id}`);

    const successBySection: Record<string, string> = {
      'staff-details': 'Staff details saved.',
      credentials: 'Credentials saved.',
      salary: 'Salary and incentives saved.',
      rights: 'Permissions saved.',
      schedule: 'Schedule saved.',
    };
    return { success: successBySection[section] ?? 'Employee updated.' };
  } catch (e) {
    logWorkforceEmployeeDbError('updateWorkforceEmployeeAction', e);
    return { error: sanitizeWorkforceEmployeeError(e) };
  }
}

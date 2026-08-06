import { and, eq } from 'drizzle-orm';
import { hashPassword } from '@/src/hair/lib/auth/crypto';
import { hairDb } from '@/src/hair/db/client';
import { fyhStaff } from '@/src/hair/db/schema';
import {
  wfEmployees,
  wfEngineMemberships,
  wfPermissionGrants,
  wfSchedules,
} from '@/src/workforce/db/schema';
import { normalizeMobile } from '@/src/workforce/auth/mobile';
import { normalizeEmail } from '@/src/workforce/auth/identity';
import { rankFromAccessRole } from '@/src/workforce/accessRoles';
import { publishEmployeeEvent } from '@/src/workforce/events/publish';
import { writeEmployeeAudit } from '@/src/workforce/brains/employeeBrain';
import { publishWorkforceEcosystemRefresh } from '@/src/workforce/connectors/ecosystemRefresh';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';
import type {
  WorkforceEngineId,
  WorkforceGender,
  WorkforceJobRole,
  WorkforcePermissionKey,
} from '@/src/workforce/types';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';

export type UpsertEmployeeInput = {
  fullName: string;
  email?: string | null;
  mobile?: string | null;
  password?: string | null;
  gender?: WorkforceGender;
  emergencyContact?: string | null;
  joiningDate?: string | null;
  aadhaarNumber?: string | null;
  panNumber?: string | null;
  salaryPaise?: number;
  upiId?: string | null;
  qrCodeUrl?: string | null;
  photoUrl?: string | null;
  status?: 'active' | 'inactive';
  engineId?: WorkforceEngineId;
  /** Access role — stored as job_role; drives ERP permissions. */
  accessRole?: WorkforceJobRole;
  /** @deprecated Use accessRole */
  jobRole?: WorkforceJobRole;
  permissions?: WorkforcePermissionKey[];
  maxBackdateDays?: number | null;
  canLogin?: boolean;
  /** Adjust bookable flag without opening permission matrix. */
  receiveBookings?: boolean;
  actorEmployeeId?: string | null;
  /** Preserve UUID when mirroring legacy staff */
  id?: string;
};

async function assertUniqueEmployeeIdentity(input: {
  email?: string | null;
  mobile?: string | null;
  excludeEmployeeId?: string;
}) {
  const email = input.email ? normalizeEmail(input.email) : null;
  const mobile = input.mobile ? normalizeMobile(input.mobile) : null;

  if (email) {
    const [existing] = await hairDb
      .select({ id: wfEmployees.id })
      .from(wfEmployees)
      .where(eq(wfEmployees.email, email))
      .limit(1);
    if (existing && existing.id !== input.excludeEmployeeId) {
      throw new Error('An employee with this email already exists.');
    }
  }

  if (mobile) {
    const [existing] = await hairDb
      .select({ id: wfEmployees.id })
      .from(wfEmployees)
      .where(eq(wfEmployees.mobile, mobile))
      .limit(1);
    if (existing && existing.id !== input.excludeEmployeeId) {
      throw new Error('An employee with this phone number already exists.');
    }
  }
}

async function mirrorSalonStaffRow(employeeId: string, input: UpsertEmployeeInput) {
  if (!isWorkforceEngineEnabled()) return;
  const accessRole = input.accessRole ?? input.jobRole ?? 'staff';
  const [existing] = await hairDb.select().from(fyhStaff).where(eq(fyhStaff.id, employeeId)).limit(1);
  const values = {
    fullName: input.fullName,
    phone: input.mobile ? normalizeMobile(input.mobile) : null,
    email: input.email ? normalizeEmail(input.email) : null,
    photoUrl: input.photoUrl ?? null,
    role: accessRole,
    joiningDate: input.joiningDate ?? null,
    isActive: (input.status ?? 'active') === 'active',
    updatedAt: new Date(),
  };
  if (existing) {
    await hairDb.update(fyhStaff).set(values).where(eq(fyhStaff.id, employeeId));
  } else {
    await hairDb.insert(fyhStaff).values({
      id: employeeId,
      ...values,
      performanceTargetPaise: 0,
      defaultCommissionType: 'none',
      defaultCommissionFixedPaise: 0,
      defaultCommissionPercentBps: 0,
    });
  }
}

export async function createEmployee(input: UpsertEmployeeInput) {
  const engineId = input.engineId ?? 'fyh_salon';
  const accessRole = input.accessRole ?? input.jobRole ?? 'staff';
  const rank = rankFromAccessRole(accessRole);
  const usesCustomPermissions = Boolean(input.permissions && input.permissions.length > 0);
  const template = codeTemplateForAccessRole(accessRole);
  let effectivePermissions = usesCustomPermissions ? [...input.permissions!] : [...template.permissions];
  if (!usesCustomPermissions && input.receiveBookings !== undefined) {
    const without = effectivePermissions.filter((k) => k !== 'appointments.receive_bookings');
    effectivePermissions = input.receiveBookings
      ? [...without, 'appointments.receive_bookings']
      : without;
  }
  const usesRoleTemplate = !usesCustomPermissions && input.receiveBookings === undefined;
  const maxBackdateDays =
    input.maxBackdateDays !== undefined ? input.maxBackdateDays : template.maxBackdateDays;

  const email = input.email ? normalizeEmail(input.email) : null;
  const mobile = input.mobile ? normalizeMobile(input.mobile) : null;
  if (!email) throw new Error('Email address is required.');
  await assertUniqueEmployeeIdentity({ email, mobile });

  const canLogin = input.canLogin ?? Boolean(input.password && input.password.length >= 6);
  if (canLogin && (!input.password || input.password.length < 6)) {
    throw new Error('Password is required (min 6 characters) when login is enabled.');
  }

  const passwordHash =
    canLogin && input.password && input.password.length >= 6
      ? hashPassword(input.password)
      : null;

  const [emp] = await hairDb
    .insert(wfEmployees)
    .values({
      id: input.id,
      fullName: input.fullName.trim(),
      email,
      mobile,
      passwordHash,
      canLogin: canLogin && Boolean(passwordHash),
      gender: input.gender ?? 'unspecified',
      emergencyContact: input.emergencyContact ?? null,
      joiningDate: input.joiningDate ?? null,
      aadhaarNumber: input.aadhaarNumber ?? null,
      panNumber: input.panNumber ?? null,
      salaryPaise: input.salaryPaise ?? 0,
      upiId: input.upiId ?? null,
      qrCodeUrl: input.qrCodeUrl ?? null,
      photoUrl: input.photoUrl ?? null,
      status: input.status ?? 'active',
    })
    .returning();

  const [mem] = await hairDb
    .insert(wfEngineMemberships)
    .values({
      employeeId: emp!.id,
      engineId,
      rank,
      jobRole: accessRole,
      isActive: true,
    })
    .returning();

  await hairDb.insert(wfPermissionGrants).values({
    membershipId: mem!.id,
    permissions: usesRoleTemplate ? [] : effectivePermissions,
    maxBackdateDays,
    usesRoleTemplate,
  });

  await mirrorSalonStaffRow(emp!.id, { ...input, accessRole });
  await writeEmployeeAudit({
    employeeId: emp!.id,
    actorEmployeeId: input.actorEmployeeId,
    action: 'employee.created',
    diff: { engineId, accessRole, rank },
  });
  await publishEmployeeEvent({
    eventType: 'employee.created',
    employeeId: emp!.id,
    engineId,
    sourceRef: 'workforce.services.createEmployee',
  });
  void publishWorkforceEcosystemRefresh(engineId).catch(() => {
    /* connectors are best-effort; never block hire */
  });

  return emp!;
}

export async function updateEmployee(
  employeeId: string,
  input: Partial<UpsertEmployeeInput> & { engineId?: WorkforceEngineId },
) {
  const engineId = input.engineId ?? 'fyh_salon';
  const patch: Partial<typeof wfEmployees.$inferInsert> = { updatedAt: new Date() };
  if (input.fullName !== undefined) patch.fullName = input.fullName.trim();
  if (input.email !== undefined) patch.email = input.email ? normalizeEmail(input.email) : null;
  if (input.mobile !== undefined) patch.mobile = input.mobile ? normalizeMobile(input.mobile) : null;
  if (input.gender !== undefined) patch.gender = input.gender;
  if (input.emergencyContact !== undefined) patch.emergencyContact = input.emergencyContact;
  if (input.joiningDate !== undefined) patch.joiningDate = input.joiningDate;
  if (input.aadhaarNumber !== undefined) patch.aadhaarNumber = input.aadhaarNumber;
  if (input.panNumber !== undefined) patch.panNumber = input.panNumber;
  if (input.salaryPaise !== undefined) patch.salaryPaise = input.salaryPaise;
  if (input.upiId !== undefined) patch.upiId = input.upiId;
  if (input.qrCodeUrl !== undefined) patch.qrCodeUrl = input.qrCodeUrl;
  if (input.photoUrl !== undefined) patch.photoUrl = input.photoUrl;
  if (input.status !== undefined) patch.status = input.status;
  if (input.password && input.password.length >= 6) {
    patch.passwordHash = hashPassword(input.password);
    patch.canLogin = true;
  }
  if (input.canLogin !== undefined) patch.canLogin = input.canLogin;

  await assertUniqueEmployeeIdentity({
    email: input.email,
    mobile: input.mobile,
    excludeEmployeeId: employeeId,
  });

  await hairDb.update(wfEmployees).set(patch).where(eq(wfEmployees.id, employeeId));

  const [mem] = await hairDb
    .select()
    .from(wfEngineMemberships)
    .where(
      and(eq(wfEngineMemberships.employeeId, employeeId), eq(wfEngineMemberships.engineId, engineId)),
    )
    .limit(1);

  const accessRole = input.accessRole ?? input.jobRole;

  if (
    mem &&
    (accessRole ||
      input.permissions ||
      input.maxBackdateDays !== undefined)
  ) {
    const role = accessRole ?? mem.jobRole;
    const rank = rankFromAccessRole(role);
    await hairDb
      .update(wfEngineMemberships)
      .set({ rank, jobRole: role, updatedAt: new Date() })
      .where(eq(wfEngineMemberships.id, mem.id));

    const usesCustom = Boolean(input.permissions && input.permissions.length > 0);
    const template = codeTemplateForAccessRole(role);
    const permissions = usesCustom ? input.permissions! : template.permissions;
    const grantMaxBackdate =
      input.maxBackdateDays !== undefined ? input.maxBackdateDays : template.maxBackdateDays;

    const [pg] = await hairDb
      .select()
      .from(wfPermissionGrants)
      .where(eq(wfPermissionGrants.membershipId, mem.id))
      .limit(1);
    if (pg) {
      await hairDb
        .update(wfPermissionGrants)
        .set({
          permissions,
          maxBackdateDays: grantMaxBackdate,
          usesRoleTemplate: !usesCustom,
          updatedAt: new Date(),
        })
        .where(eq(wfPermissionGrants.id, pg.id));
    } else {
      await hairDb.insert(wfPermissionGrants).values({
        membershipId: mem.id,
        permissions,
        maxBackdateDays: grantMaxBackdate,
        usesRoleTemplate: !usesCustom,
      });
    }

    await publishEmployeeEvent({
      eventType: 'employee.role.changed',
      employeeId,
      engineId,
      sourceRef: 'workforce.services.updateEmployee',
    });
    await publishEmployeeEvent({
      eventType: 'employee.permission.changed',
      employeeId,
      engineId,
      sourceRef: 'workforce.services.updateEmployee',
    });
  }

  if (input.salaryPaise !== undefined) {
    await publishEmployeeEvent({
      eventType: 'employee.salary.changed',
      employeeId,
      engineId,
      payload: { salaryPaise: input.salaryPaise },
      sourceRef: 'workforce.services.updateEmployee',
    });
  }

  let fullName = input.fullName;
  if (!fullName) {
    const [cur] = await hairDb
      .select({ fullName: wfEmployees.fullName })
      .from(wfEmployees)
      .where(eq(wfEmployees.id, employeeId))
      .limit(1);
    fullName = cur?.fullName ?? 'Employee';
  }
  await mirrorSalonStaffRow(employeeId, {
    fullName,
    email: input.email,
    mobile: input.mobile,
    photoUrl: input.photoUrl,
    accessRole: accessRole ?? mem?.jobRole,
    status: input.status,
    joiningDate: input.joiningDate,
  });

  await writeEmployeeAudit({
    employeeId,
    actorEmployeeId: input.actorEmployeeId,
    action: 'employee.updated',
    diff: { ...input, password: input.password ? '[set]' : undefined },
  });
  await publishEmployeeEvent({
    eventType: 'employee.updated',
    employeeId,
    engineId,
    sourceRef: 'workforce.services.updateEmployee',
  });
}

export async function resetEmployeePermissionsToRoleTemplate(
  employeeId: string,
  engineId: WorkforceEngineId = 'fyh_salon',
  actorEmployeeId?: string | null,
) {
  const [mem] = await hairDb
    .select()
    .from(wfEngineMemberships)
    .where(
      and(eq(wfEngineMemberships.employeeId, employeeId), eq(wfEngineMemberships.engineId, engineId)),
    )
    .limit(1);
  if (!mem) throw new Error('Employee membership not found.');

  const template = codeTemplateForAccessRole(mem.jobRole);
  const [pg] = await hairDb
    .select()
    .from(wfPermissionGrants)
    .where(eq(wfPermissionGrants.membershipId, mem.id))
    .limit(1);

  if (pg) {
    await hairDb
      .update(wfPermissionGrants)
      .set({
        permissions: template.permissions,
        maxBackdateDays: template.maxBackdateDays,
        usesRoleTemplate: true,
        updatedAt: new Date(),
      })
      .where(eq(wfPermissionGrants.id, pg.id));
  } else {
    await hairDb.insert(wfPermissionGrants).values({
      membershipId: mem.id,
      permissions: template.permissions,
      maxBackdateDays: template.maxBackdateDays,
      usesRoleTemplate: true,
    });
  }

  await writeEmployeeAudit({
    employeeId,
    actorEmployeeId,
    action: 'employee.permissions.reset_to_role_template',
    diff: { accessRole: mem.jobRole },
  });
  await publishEmployeeEvent({
    eventType: 'employee.permission.changed',
    employeeId,
    engineId,
    sourceRef: 'workforce.services.resetEmployeePermissionsToRoleTemplate',
  });
}

export async function saveEmployeeScheduleDay(input: {
  employeeId: string;
  engineId?: WorkforceEngineId;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isOff: boolean;
}) {
  const engineId = input.engineId ?? 'fyh_salon';
  const [existing] = await hairDb
    .select()
    .from(wfSchedules)
    .where(
      and(
        eq(wfSchedules.employeeId, input.employeeId),
        eq(wfSchedules.engineId, engineId),
        eq(wfSchedules.dayOfWeek, input.dayOfWeek),
      ),
    )
    .limit(1);
  if (existing) {
    await hairDb
      .update(wfSchedules)
      .set({
        startTime: input.startTime,
        endTime: input.endTime,
        isOff: input.isOff,
        updatedAt: new Date(),
      })
      .where(eq(wfSchedules.id, existing.id));
  } else {
    await hairDb.insert(wfSchedules).values({
      employeeId: input.employeeId,
      engineId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      isOff: input.isOff,
    });
  }
}

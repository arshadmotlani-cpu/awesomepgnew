import { and, eq } from 'drizzle-orm';
import { hashPassword } from '@/src/hair/lib/auth/crypto';
import { hairDb } from '@/src/hair/db/client';
import { fyhStaff } from '@/src/hair/db/schema';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import {
  wfAuditLog,
  wfEmployees,
  wfEngineMemberships,
  wfIncentivePlans,
  wfPermissionGrants,
  wfSchedules,
} from '@/src/workforce/db/schema';
import { normalizeMobile } from '@/src/workforce/auth/mobile';
import { normalizeEmail } from '@/src/workforce/auth/identity';
import { rankFromAccessRole } from '@/src/workforce/accessRoles';
import { publishEmployeeEvent } from '@/src/workforce/events/publish';
import { formatPostgresError } from '@/src/lib/db/postgresError';
import { writeEmployeeAudit } from '@/src/workforce/brains/employeeBrain';
import { publishWorkforceEcosystemRefresh } from '@/src/workforce/connectors/ecosystemRefresh';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';
import type {
  WorkforceEngineId,
  WorkforceGender,
  WorkforceJobRole,
  WorkforcePermissionKey,
} from '@/src/workforce/types';
import type {
  WorkforceIncentivePlanInput,
  WorkforcePaymentMethod,
  WorkforceSalaryFrequency,
} from '@/src/workforce/types/hr';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';
import { upsertEmployeeWeeklySchedule, getEmployeeSchedule, mirrorWeeklyScheduleToLegacyStaffSchedules } from '@/src/workforce/services/schedules';
import {
  DEFAULT_WEEK_SCHEDULE,
  scheduleFromWeekOffDays,
  weekOffDaysFromSchedule,
  type DayScheduleInput,
} from '@/src/workforce/lib/weekOff';
import {
  applyWeekOffToExistingSchedule,
  reconcileScheduleWithWeekOff,
} from '@/src/workforce/lib/scheduleEditor';
import { upsertIncentivePlan } from '@/src/workforce/services/incentivePlans';

export type UpsertEmployeeInput = {
  fullName: string;
  email?: string | null;
  mobile?: string | null;
  password?: string | null;
  /**
   * Precomputed password hash (e.g. reused from Platform identity).
   * When provided, we do not re-hash the password to avoid hash-salt drift.
   */
  passwordHash?: string | null;
  /** Optional FYH SaaS tenant wiring (mirrors Platform org/user ids). */
  organizationId?: string | null;
  locationId?: string | null;
  userId?: string | null;
  gender?: WorkforceGender;
  emergencyContact?: string | null;
  joiningDate?: string | null;
  aadhaarNumber?: string | null;
  panNumber?: string | null;
  salaryPaise?: number;
  salaryFrequency?: WorkforceSalaryFrequency;
  salaryEffectiveFrom?: string | null;
  bankAccountHolderName?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  primaryPaymentMethod?: WorkforcePaymentMethod;
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
  weekOffDays?: number[];
  /** Full weekly schedule with times; overrides weekOffDays when provided. */
  scheduleDays?: DayScheduleInput[];
  incentivePlan?: WorkforceIncentivePlanInput;
  /** Permanent salon owner provider — hidden from Staff Management */
  isSystemProvider?: boolean;
};

type HairDbClient = typeof hairDb;

function resolveTenantColumns(input: Pick<UpsertEmployeeInput, 'organizationId' | 'locationId'>) {
  if (isFyhSaasTenantEnabled()) {
    if (!input.organizationId) {
      throw new Error('Organization context is required to create an employee.');
    }
    if (!input.locationId) {
      throw new Error('Location context is missing. Select a location and try again.');
    }
    return { organizationId: input.organizationId, locationId: input.locationId };
  }
  return {
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    ...(input.locationId ? { locationId: input.locationId } : {}),
  };
}

/** wf_employees / memberships / grants / audit / incentive plans have organization_id only. */
function organizationTenantCols(t: { organizationId?: string; locationId?: string }) {
  return t.organizationId ? { organizationId: t.organizationId } : {};
}

async function assertUniqueEmployeeIdentity(input: {
  email?: string | null;
  mobile?: string | null;
  excludeEmployeeId?: string;
  organizationId?: string | null;
  tx?: HairDbClient;
}) {
  const db = input.tx ?? hairDb;
  const email = input.email ? normalizeEmail(input.email) : null;
  const mobile = input.mobile ? normalizeMobile(input.mobile) : null;

  if (email) {
    const where = input.organizationId
      ? and(eq(wfEmployees.email, email), eq(wfEmployees.organizationId, input.organizationId))
      : eq(wfEmployees.email, email);
    const [existing] = await db.select({ id: wfEmployees.id }).from(wfEmployees).where(where).limit(1);
    if (existing && existing.id !== input.excludeEmployeeId) {
      throw new Error('An employee with this email already exists.');
    }
  }

  if (mobile) {
    const where = input.organizationId
      ? and(eq(wfEmployees.mobile, mobile), eq(wfEmployees.organizationId, input.organizationId))
      : eq(wfEmployees.mobile, mobile);
    const [existing] = await db.select({ id: wfEmployees.id }).from(wfEmployees).where(where).limit(1);
    if (existing && existing.id !== input.excludeEmployeeId) {
      throw new Error('An employee with this phone number already exists.');
    }
  }
}

async function mirrorSalonStaffRow(
  employeeId: string,
  input: UpsertEmployeeInput,
  tx?: HairDbClient,
) {
  if (!isWorkforceEngineEnabled()) return;
  const db = tx ?? hairDb;
  const accessRole = input.accessRole ?? input.jobRole ?? 'staff';
  const [existing] = await db.select().from(fyhStaff).where(eq(fyhStaff.id, employeeId)).limit(1);
  const staffOrgId = input.organizationId ?? existing?.organizationId ?? null;
  const values = {
    fullName: input.fullName,
    phone: input.mobile ? normalizeMobile(input.mobile) : null,
    email: input.email ? normalizeEmail(input.email) : null,
    photoUrl: input.photoUrl ?? null,
    role: accessRole,
    joiningDate: input.joiningDate ?? null,
    isActive: (input.status ?? 'active') === 'active',
    updatedAt: new Date(),
    ...(staffOrgId ? { organizationId: staffOrgId } : {}),
  };
  if (existing) {
    await db.update(fyhStaff).set(values).where(eq(fyhStaff.id, employeeId));
  } else {
    await db.insert(fyhStaff).values({
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
  if (!email && !input.isSystemProvider) throw new Error('Email address is required.');
  const tenantCols = input.isSystemProvider
    ? {
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        ...(input.locationId ? { locationId: input.locationId } : {}),
      }
    : resolveTenantColumns(input);

  const canLoginByPassword =
    Boolean(input.password && input.password.length >= 6) || input.passwordHash != null;
  const canLogin = input.canLogin ?? canLoginByPassword;
  if (canLogin && !input.passwordHash && (!input.password || input.password.length < 6)) {
    throw new Error('Password is required (min 6 characters) or passwordHash when login is enabled.');
  }

  const passwordHash =
    canLogin && input.passwordHash != null
      ? input.passwordHash
      : canLogin && input.password && input.password.length >= 6
        ? hashPassword(input.password)
        : null;

  const weekOff = input.weekOffDays ?? [0];
  const resolvedDays = input.scheduleDays
    ? reconcileScheduleWithWeekOff(input.scheduleDays, weekOff)
    : scheduleFromWeekOffDays(weekOff);

  const emp = await hairDb.transaction(async (tx) => {
    if (email || mobile) {
      await assertUniqueEmployeeIdentity({
        email,
        mobile,
        organizationId: tenantCols.organizationId ?? input.organizationId ?? null,
        tx: tx as unknown as HairDbClient,
      });
    }

    const [created] = await tx
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
        salaryFrequency: input.salaryFrequency ?? 'monthly',
        salaryEffectiveFrom: input.salaryEffectiveFrom ?? null,
        bankAccountHolderName: input.bankAccountHolderName ?? null,
        bankName: input.bankName ?? null,
        accountNumber: input.accountNumber ?? null,
        ifscCode: input.ifscCode ?? null,
        primaryPaymentMethod: input.primaryPaymentMethod ?? 'upi',
        upiId: input.upiId ?? null,
        qrCodeUrl: input.qrCodeUrl ?? null,
        photoUrl: input.photoUrl ?? null,
        status: input.status ?? 'active',
        isSystemProvider: input.isSystemProvider ?? false,
        userId: input.userId ?? null,
        ...organizationTenantCols(tenantCols),
      })
      .returning();

    const [mem] = await tx
      .insert(wfEngineMemberships)
      .values({
        employeeId: created!.id,
        engineId,
        rank,
        jobRole: accessRole,
        isActive: true,
        ...organizationTenantCols(tenantCols),
      })
      .returning();

    await tx.insert(wfPermissionGrants).values({
      membershipId: mem!.id,
      permissions: usesRoleTemplate ? [] : effectivePermissions,
      maxBackdateDays,
      usesRoleTemplate,
      ...organizationTenantCols(tenantCols),
    });

    await mirrorSalonStaffRow(
      created!.id,
      { ...input, accessRole, organizationId: tenantCols.organizationId ?? input.organizationId },
      tx as unknown as HairDbClient,
    );

    await upsertEmployeeWeeklySchedule({
      employeeId: created!.id,
      engineId,
      days: resolvedDays,
      actorEmployeeId: input.actorEmployeeId,
      organizationId: tenantCols.organizationId,
      locationId: tenantCols.locationId ?? input.locationId ?? null,
      tx: tx as unknown as HairDbClient,
      deferSideEffects: true,
    });

    if (input.incentivePlan) {
      await tx.insert(wfIncentivePlans).values({
        employeeId: created!.id,
        engineId,
        planType: input.incentivePlan.planType,
        config: input.incentivePlan.config,
        effectiveFrom: input.incentivePlan.effectiveFrom ?? null,
        ...organizationTenantCols(tenantCols),
      });
    }

    await tx.insert(wfAuditLog).values({
      employeeId: created!.id,
      actorEmployeeId: input.actorEmployeeId ?? null,
      action: 'employee.created',
      diff: { engineId, accessRole, rank },
      ...organizationTenantCols(tenantCols),
    });

    return created!;
  });

  const tenantScope =
    tenantCols.organizationId && (tenantCols.locationId ?? input.locationId)
      ? {
          organizationId: tenantCols.organizationId,
          locationId: tenantCols.locationId ?? input.locationId!,
        }
      : null;

  try {
    await mirrorWeeklyScheduleSideEffects(
      emp.id,
      resolvedDays,
      engineId,
      input.actorEmployeeId,
      tenantScope,
    );
  } catch (err) {
    console.error(
      '[workforce.createEmployee] post-commit schedule mirror failed:',
      formatPostgresError(err),
    );
  }

  try {
    await publishEmployeeEvent({
      eventType: 'employee.created',
      employeeId: emp.id,
      engineId,
      sourceRef: 'workforce.services.createEmployee',
    });
  } catch (err) {
    console.error(
      '[workforce.createEmployee] post-commit event publish failed:',
      formatPostgresError(err),
    );
  }

  void publishWorkforceEcosystemRefresh(engineId).catch(() => {
    /* connectors are best-effort; never block hire */
  });

  return emp;
}

async function mirrorWeeklyScheduleSideEffects(
  employeeId: string,
  days: DayScheduleInput[],
  engineId: WorkforceEngineId,
  actorEmployeeId?: string | null,
  tenant?: { organizationId: string; locationId: string } | null,
) {
  await mirrorWeeklyScheduleToLegacyStaffSchedules(employeeId, days, tenant);
  await publishEmployeeEvent({
    eventType: 'employee.schedule.updated',
    employeeId,
    engineId,
    payload: { days: days.length, actorEmployeeId: actorEmployeeId ?? null },
  });
}

export async function updateEmployee(
  employeeId: string,
  input: Partial<UpsertEmployeeInput> & { engineId?: WorkforceEngineId },
) {
  const engineId = input.engineId ?? 'fyh_salon';

  const [current] = await hairDb
    .select()
    .from(wfEmployees)
    .where(eq(wfEmployees.id, employeeId))
    .limit(1);
  if (!current) throw new Error('Employee not found.');
  if (current.isSystemProvider) {
    if (input.status === 'inactive') {
      throw new Error('The salon owner cannot be deactivated.');
    }
    if (input.isSystemProvider === false) {
      throw new Error('The salon owner identity cannot be removed.');
    }
  }

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
  if (input.salaryFrequency !== undefined) patch.salaryFrequency = input.salaryFrequency;
  if (input.salaryEffectiveFrom !== undefined) patch.salaryEffectiveFrom = input.salaryEffectiveFrom;
  if (input.bankAccountHolderName !== undefined) patch.bankAccountHolderName = input.bankAccountHolderName;
  if (input.bankName !== undefined) patch.bankName = input.bankName;
  if (input.accountNumber !== undefined) patch.accountNumber = input.accountNumber;
  if (input.ifscCode !== undefined) patch.ifscCode = input.ifscCode;
  if (input.primaryPaymentMethod !== undefined) patch.primaryPaymentMethod = input.primaryPaymentMethod;
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
    organizationId: current.organizationId,
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
      input.maxBackdateDays !== undefined ||
      input.receiveBookings !== undefined)
  ) {
    const role = accessRole ?? mem.jobRole;
    const rank = rankFromAccessRole(role);
    await hairDb
      .update(wfEngineMemberships)
      .set({ rank, jobRole: role, updatedAt: new Date() })
      .where(eq(wfEngineMemberships.id, mem.id));

    const usesCustom = Boolean(input.permissions && input.permissions.length > 0);
    const template = codeTemplateForAccessRole(role);
    let permissions = usesCustom ? [...input.permissions!] : [...template.permissions];
    if (!usesCustom && input.receiveBookings !== undefined) {
      const without = permissions.filter((k) => k !== 'appointments.receive_bookings');
      permissions = input.receiveBookings
        ? [...without, 'appointments.receive_bookings']
        : without;
    }
    const grantMaxBackdate =
      input.maxBackdateDays !== undefined ? input.maxBackdateDays : template.maxBackdateDays;
    const usesRoleTemplate = !usesCustom && input.receiveBookings === undefined;

    const [pg] = await hairDb
      .select()
      .from(wfPermissionGrants)
      .where(eq(wfPermissionGrants.membershipId, mem.id))
      .limit(1);
    if (pg) {
      await hairDb
        .update(wfPermissionGrants)
        .set({
          permissions: usesRoleTemplate ? [] : permissions,
          maxBackdateDays: grantMaxBackdate,
          usesRoleTemplate,
          updatedAt: new Date(),
        })
        .where(eq(wfPermissionGrants.id, pg.id));
    } else {
      await hairDb.insert(wfPermissionGrants).values({
        membershipId: mem.id,
        permissions: usesRoleTemplate ? [] : permissions,
        maxBackdateDays: grantMaxBackdate,
        usesRoleTemplate,
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

  if (input.scheduleDays) {
    const weekOff =
      input.weekOffDays ??
      weekOffDaysFromSchedule(
        input.scheduleDays.map((d) => ({ dayOfWeek: d.dayOfWeek, isOff: Boolean(d.isOff) })),
      );
    await upsertEmployeeWeeklySchedule({
      employeeId,
      engineId,
      days: reconcileScheduleWithWeekOff(input.scheduleDays, weekOff),
      actorEmployeeId: input.actorEmployeeId,
    });
  } else if (input.weekOffDays) {
    const existing = await getEmployeeSchedule(employeeId, engineId);
    const base =
      existing.length > 0
        ? existing.map((row) => ({
            dayOfWeek: row.dayOfWeek,
            startTime: row.startTime,
            endTime: row.endTime,
            lunchStart: row.lunchStart,
            lunchEnd: row.lunchEnd,
            isOff: row.isOff,
          }))
        : DEFAULT_WEEK_SCHEDULE;
    await upsertEmployeeWeeklySchedule({
      employeeId,
      engineId,
      days: applyWeekOffToExistingSchedule(base, input.weekOffDays),
      actorEmployeeId: input.actorEmployeeId,
    });
  }

  if (input.incentivePlan) {
    await upsertIncentivePlan({
      employeeId,
      engineId,
      plan: input.incentivePlan,
    });
  }

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

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
import { publishEmployeeEvent } from '@/src/workforce/events/publish';
import { writeEmployeeAudit } from '@/src/workforce/brains/employeeBrain';
import { publishWorkforceEcosystemRefresh } from '@/src/workforce/connectors/ecosystemRefresh';
import { defaultGrantsFor } from '@/src/workforce/permissions/presets';
import type {
  WorkforceEngineId,
  WorkforceGender,
  WorkforceJobRole,
  WorkforcePermissionKey,
  WorkforceRank,
} from '@/src/workforce/types';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';

export type UpsertEmployeeInput = {
  fullName: string;
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
  rank?: WorkforceRank;
  jobRole?: WorkforceJobRole;
  permissions?: WorkforcePermissionKey[];
  maxBackdateDays?: number | null;
  canLogin?: boolean;
  actorEmployeeId?: string | null;
  /** Preserve UUID when mirroring legacy staff */
  id?: string;
};

async function mirrorSalonStaffRow(employeeId: string, input: UpsertEmployeeInput) {
  if (!isWorkforceEngineEnabled()) return;
  const [existing] = await hairDb.select().from(fyhStaff).where(eq(fyhStaff.id, employeeId)).limit(1);
  const values = {
    fullName: input.fullName,
    phone: input.mobile ? normalizeMobile(input.mobile) : null,
    photoUrl: input.photoUrl ?? null,
    role: input.jobRole ?? 'stylist',
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
      email: null,
      performanceTargetPaise: 0,
      defaultCommissionType: 'none',
      defaultCommissionFixedPaise: 0,
      defaultCommissionPercentBps: 0,
    });
  }
}

export async function createEmployee(input: UpsertEmployeeInput) {
  const engineId = input.engineId ?? 'fyh_salon';
  const rank = input.rank ?? 'team_member';
  const jobRole = input.jobRole ?? 'stylist';
  const grants = defaultGrantsFor(rank, jobRole);
  if (input.permissions) grants.permissions = input.permissions;
  if (input.maxBackdateDays !== undefined) grants.maxBackdateDays = input.maxBackdateDays;

  const mobile = input.mobile ? normalizeMobile(input.mobile) : null;
  const passwordHash =
    input.password && input.password.length >= 6 ? hashPassword(input.password) : null;
  const canLogin = input.canLogin ?? Boolean(passwordHash);

  const [emp] = await hairDb
    .insert(wfEmployees)
    .values({
      id: input.id,
      fullName: input.fullName.trim(),
      mobile,
      passwordHash,
      canLogin,
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
      jobRole,
      isActive: true,
    })
    .returning();

  await hairDb.insert(wfPermissionGrants).values({
    membershipId: mem!.id,
    permissions: grants.permissions,
    maxBackdateDays: grants.maxBackdateDays,
  });

  await mirrorSalonStaffRow(emp!.id, { ...input, jobRole });
  await writeEmployeeAudit({
    employeeId: emp!.id,
    actorEmployeeId: input.actorEmployeeId,
    action: 'employee.created',
    diff: { engineId, rank, jobRole },
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

  await hairDb.update(wfEmployees).set(patch).where(eq(wfEmployees.id, employeeId));

  const [mem] = await hairDb
    .select()
    .from(wfEngineMemberships)
    .where(
      and(eq(wfEngineMemberships.employeeId, employeeId), eq(wfEngineMemberships.engineId, engineId)),
    )
    .limit(1);

  if (mem && (input.rank || input.jobRole || input.permissions || input.maxBackdateDays !== undefined)) {
    const rank = input.rank ?? mem.rank;
    const jobRole = input.jobRole ?? mem.jobRole;
    await hairDb
      .update(wfEngineMemberships)
      .set({ rank, jobRole, updatedAt: new Date() })
      .where(eq(wfEngineMemberships.id, mem.id));

    const grants = defaultGrantsFor(rank, jobRole);
    if (input.permissions) grants.permissions = input.permissions;
    if (input.maxBackdateDays !== undefined) grants.maxBackdateDays = input.maxBackdateDays;

    const [pg] = await hairDb
      .select()
      .from(wfPermissionGrants)
      .where(eq(wfPermissionGrants.membershipId, mem.id))
      .limit(1);
    if (pg) {
      await hairDb
        .update(wfPermissionGrants)
        .set({
          permissions: grants.permissions,
          maxBackdateDays: grants.maxBackdateDays,
          updatedAt: new Date(),
        })
        .where(eq(wfPermissionGrants.id, pg.id));
    } else {
      await hairDb.insert(wfPermissionGrants).values({
        membershipId: mem.id,
        permissions: grants.permissions,
        maxBackdateDays: grants.maxBackdateDays,
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
    mobile: input.mobile,
    photoUrl: input.photoUrl,
    jobRole: input.jobRole,
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

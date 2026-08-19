import { and, desc, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import {
  wfAttendance,
  wfAuditLog,
  wfEmployees,
  wfEngineMemberships,
  wfPermissionGrants,
  wfSchedules,
  type WfEmployee,
  type WfEngineMembership,
} from '@/src/workforce/db/schema';
import { publishEmployeeEvent } from '@/src/workforce/events/publish';
import {
  hasWorkforcePermission,
  resolveEffectiveGrants,
} from '@/src/workforce/permissions/resolve';
import type {
  WorkforceEngineId,
  WorkforceJobRole,
  WorkforcePermissionGrants,
  WorkforcePermissionKey,
} from '@/src/workforce/types';
import { normalizeMobile } from '@/src/workforce/auth/mobile';
import { ensureRoleTemplatesSeeded } from '@/src/workforce/services/roleTemplates';

export type EmployeeWithMembership = {
  employee: WfEmployee;
  membership: WfEngineMembership;
  grants: WorkforcePermissionGrants;
};

async function loadGrants(
  membership: WfEngineMembership,
  engineId: WorkforceEngineId,
): Promise<WorkforcePermissionGrants> {
  const [row] = await hairDb
    .select()
    .from(wfPermissionGrants)
    .where(eq(wfPermissionGrants.membershipId, membership.id))
    .limit(1);

  return resolveEffectiveGrants({
    engineId,
    accessRole: membership.jobRole,
    grantRow: row
      ? {
          permissions: row.permissions,
          maxBackdateDays: row.maxBackdateDays,
          usesRoleTemplate: row.usesRoleTemplate,
        }
      : null,
  });
}

export async function getEmployee(employeeId: string): Promise<WfEmployee | null> {
  const [row] = await hairDb
    .select()
    .from(wfEmployees)
    .where(eq(wfEmployees.id, employeeId))
    .limit(1);
  return row ?? null;
}

export async function listEmployeesForEngine(
  engineId: WorkforceEngineId,
  opts?: {
    activeOnly?: boolean;
    receiveBookingsOnly?: boolean;
    excludeSystemProviders?: boolean;
    organizationId?: string;
  },
): Promise<EmployeeWithMembership[]> {
  await ensureRoleTemplatesSeeded(engineId);
  const activeOnly = opts?.activeOnly !== false;
  const orgScope =
    isFyhSaasTenantEnabled() && opts?.organizationId
      ? eq(wfEmployees.organizationId, opts.organizationId)
      : undefined;
  const rows = await hairDb
    .select({
      employee: wfEmployees,
      membership: wfEngineMemberships,
    })
    .from(wfEngineMemberships)
    .innerJoin(wfEmployees, eq(wfEmployees.id, wfEngineMemberships.employeeId))
    .where(
      activeOnly
        ? and(
            eq(wfEngineMemberships.engineId, engineId),
            eq(wfEngineMemberships.isActive, true),
            eq(wfEmployees.status, 'active'),
            orgScope,
          )
        : and(eq(wfEngineMemberships.engineId, engineId), orgScope),
    );

  const out: EmployeeWithMembership[] = [];
  for (const row of rows) {
    if (opts?.excludeSystemProviders && row.employee.isSystemProvider) continue;
    const grants = await loadGrants(row.membership, engineId);
    if (
      opts?.receiveBookingsOnly &&
      !hasWorkforcePermission(grants, 'appointments.receive_bookings')
    ) {
      continue;
    }
    out.push({ employee: row.employee, membership: row.membership, grants });
  }
  return out.sort((a, b) => a.employee.fullName.localeCompare(b.employee.fullName));
}

export async function resolvePermissions(
  employeeId: string,
  engineId: WorkforceEngineId,
): Promise<WorkforcePermissionGrants | null> {
  const [row] = await hairDb
    .select({ membership: wfEngineMemberships })
    .from(wfEngineMemberships)
    .where(
      and(
        eq(wfEngineMemberships.employeeId, employeeId),
        eq(wfEngineMemberships.engineId, engineId),
        eq(wfEngineMemberships.isActive, true),
      ),
    )
    .limit(1);
  if (!row) return null;
  return loadGrants(row.membership, engineId);
}

export async function employeeHasPermission(
  employeeId: string,
  engineId: WorkforceEngineId,
  key: WorkforcePermissionKey,
): Promise<boolean> {
  const grants = await resolvePermissions(employeeId, engineId);
  return hasWorkforcePermission(grants, key);
}

export async function listMemberships(employeeId: string) {
  return hairDb
    .select()
    .from(wfEngineMemberships)
    .where(and(eq(wfEngineMemberships.employeeId, employeeId), eq(wfEngineMemberships.isActive, true)));
}

export type EmployeeDashboardSnapshot = {
  employee: WfEmployee;
  membership: WfEngineMembership | null;
  grants: WorkforcePermissionGrants | null;
  schedule: Array<typeof wfSchedules.$inferSelect>;
  recentAttendance: Array<typeof wfAttendance.$inferSelect>;
};

export async function getEmployeeDashboard(
  employeeId: string,
  engineId: WorkforceEngineId = 'fyh_salon',
): Promise<EmployeeDashboardSnapshot | null> {
  const employee = await getEmployee(employeeId);
  if (!employee) return null;

  const [membership] = await hairDb
    .select()
    .from(wfEngineMemberships)
    .where(
      and(
        eq(wfEngineMemberships.employeeId, employeeId),
        eq(wfEngineMemberships.engineId, engineId),
      ),
    )
    .limit(1);

  const grants = membership ? await loadGrants(membership, engineId) : null;

  const schedule = await hairDb
    .select()
    .from(wfSchedules)
    .where(and(eq(wfSchedules.employeeId, employeeId), eq(wfSchedules.engineId, engineId)));

  const recentAttendance = await hairDb
    .select()
    .from(wfAttendance)
    .where(and(eq(wfAttendance.employeeId, employeeId), eq(wfAttendance.engineId, engineId)))
    .orderBy(desc(wfAttendance.workDate))
    .limit(14);

  return { employee, membership: membership ?? null, grants, schedule, recentAttendance };
}

export async function writeEmployeeAudit(input: {
  employeeId?: string | null;
  actorEmployeeId?: string | null;
  action: string;
  diff?: Record<string, unknown>;
}): Promise<void> {
  await hairDb.insert(wfAuditLog).values({
    employeeId: input.employeeId ?? null,
    actorEmployeeId: input.actorEmployeeId ?? null,
    action: input.action,
    diff: input.diff ?? {},
  });
}

export async function findEmployeeByMobile(mobileRaw: string): Promise<WfEmployee | null> {
  const mobile = normalizeMobile(mobileRaw);
  if (!mobile) return null;
  const [row] = await hairDb
    .select()
    .from(wfEmployees)
    .where(eq(wfEmployees.mobile, mobile))
    .limit(1);
  return row ?? null;
}

export async function findEmployeeByLegacyAdminId(adminId: string): Promise<WfEmployee | null> {
  const [row] = await hairDb
    .select()
    .from(wfEmployees)
    .where(eq(wfEmployees.legacyAdminUserId, adminId))
    .limit(1);
  return row ?? null;
}

export { publishEmployeeEvent };

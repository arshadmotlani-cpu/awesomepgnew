import { asc, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhAdminUsers,
  fyhStaff,
  fyhStaffSchedules,
} from '@/src/hair/db/schema';
import {
  wfEmployees,
  wfEngineMemberships,
  wfPermissionGrants,
  wfSchedules,
} from '@/src/workforce/db/schema';
import { normalizeMobile } from '@/src/workforce/auth/mobile';
import { defaultGrantsFor, mapLegacyHairPermissions } from '@/src/workforce/permissions/presets';
import type { WorkforceJobRole, WorkforceRank } from '@/src/workforce/types';
import { publishEmployeeEvent } from '@/src/workforce/events/publish';

function mapStaffRoleToJob(role: string | null | undefined): WorkforceJobRole {
  const r = (role ?? '').toLowerCase();
  if (r.includes('recept') || r.includes('account') || r.includes('bill')) return 'biller';
  if (r.includes('clean') || r.includes('house') || r.includes('secur') || r.includes('driv')) return 'staff';
  if (r.includes('manager')) return 'manager';
  if (r.includes('owner')) return 'owner';
  return 'staff';
}

function placeholderMobileFromId(id: string): string {
  const digits = id.replace(/\D/g, '').slice(0, 10).padEnd(10, '0');
  return `+91${digits}`;
}

export type MigrateWorkforceResult = {
  dryRun: boolean;
  adminsMigrated: number;
  staffMigrated: number;
  schedulesMigrated: number;
  ownerEmployeeId: string | null;
  notes: string[];
};

export async function migrateHairToWorkforce(opts: {
  dryRun: boolean;
}): Promise<MigrateWorkforceResult> {
  const notes: string[] = [];
  let adminsMigrated = 0;
  let staffMigrated = 0;
  let schedulesMigrated = 0;
  let ownerEmployeeId: string | null = null;

  const admins = await hairDb.select().from(fyhAdminUsers).orderBy(asc(fyhAdminUsers.createdAt));
  const staff = await hairDb.select().from(fyhStaff);

  for (const admin of admins) {
    const existing = await hairDb
      .select({ id: wfEmployees.id })
      .from(wfEmployees)
      .where(eq(wfEmployees.legacyAdminUserId, admin.id))
      .limit(1);
    if (existing[0]) {
      if (admin.role === 'super_admin') ownerEmployeeId = existing[0].id;
      notes.push(`skip admin already migrated: ${admin.email}`);
      continue;
    }

    const isOwner = admin.role === 'super_admin';
    const rank: WorkforceRank = isOwner ? 'owner' : 'manager';
    const jobRole: WorkforceJobRole = isOwner ? 'owner' : 'manager';
    const mobile =
      normalizeMobile(admin.displayName?.match(/\d{10}/)?.[0] ?? '') ??
      placeholderMobileFromId(admin.id);

    const grants = mapLegacyHairPermissions(
      admin.role === 'super_admin' ? 'super_admin' : 'admin',
      (admin.permissions as string[]) ?? [],
    );

    if (opts.dryRun) {
      notes.push(
        `DRY admin → employee: ${admin.email} rank=${rank} mobile=${mobile} hashPreserved=${Boolean(admin.passwordHash)}`,
      );
      adminsMigrated += 1;
      if (isOwner) ownerEmployeeId = 'dry-run-owner';
      continue;
    }

    const [emp] = await hairDb
      .insert(wfEmployees)
      .values({
        fullName: admin.displayName?.trim() || admin.email.split('@')[0] || 'Owner',
        mobile,
        email: admin.email,
        passwordHash: admin.passwordHash,
        canLogin: true,
        status: 'active',
        legacyAdminUserId: admin.id,
      })
      .returning();

    const [mem] = await hairDb
      .insert(wfEngineMemberships)
      .values({
        employeeId: emp!.id,
        engineId: 'fyh_salon',
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

    await publishEmployeeEvent({
      eventType: 'employee.created',
      employeeId: emp!.id,
      engineId: 'fyh_salon',
      payload: { source: 'migrateHairToWorkforce', legacyAdminUserId: admin.id },
      sourceRef: 'workforce.migrate.admin',
    });

    adminsMigrated += 1;
    if (isOwner) ownerEmployeeId = emp!.id;
    notes.push(`migrated admin ${admin.email} → ${emp!.id}`);
  }

  for (const s of staff) {
    const existingById = await hairDb
      .select({ id: wfEmployees.id })
      .from(wfEmployees)
      .where(eq(wfEmployees.id, s.id))
      .limit(1);
    if (existingById[0]) {
      notes.push(`skip staff id already employee: ${s.fullName}`);
      continue;
    }

    const phone = s.phone ? normalizeMobile(s.phone) : null;
    let matchedAdminEmployee: string | null = null;
    if (phone) {
      const [byMobile] = await hairDb
        .select({ id: wfEmployees.id })
        .from(wfEmployees)
        .where(eq(wfEmployees.mobile, phone))
        .limit(1);
      if (byMobile) matchedAdminEmployee = byMobile.id;
    }

    const jobRole = mapStaffRoleToJob(s.role);
    const rank: WorkforceRank =
      jobRole === 'owner' ? 'owner' : jobRole === 'manager' ? 'manager' : 'team_member';
    const grants = defaultGrantsFor(rank, jobRole);

    if (matchedAdminEmployee) {
      // Same person: attach roster fields onto membership if missing salon membership extras
      if (!opts.dryRun) {
        await hairDb
          .update(wfEngineMemberships)
          .set({
            defaultCommissionType: s.defaultCommissionType,
            defaultCommissionFixedPaise: s.defaultCommissionFixedPaise,
            defaultCommissionPercentBps: s.defaultCommissionPercentBps,
            performanceTargetPaise: s.performanceTargetPaise,
            jobRole,
            updatedAt: new Date(),
          })
          .where(eq(wfEngineMemberships.employeeId, matchedAdminEmployee));
      }
      notes.push(`linked staff ${s.fullName} to existing employee ${matchedAdminEmployee}`);
      staffMigrated += 1;
      continue;
    }

    if (opts.dryRun) {
      notes.push(`DRY staff → employee id=${s.id} role=${jobRole} canLogin=false`);
      staffMigrated += 1;
      continue;
    }

    await hairDb.insert(wfEmployees).values({
      id: s.id,
      fullName: s.fullName,
      mobile: phone,
      email: s.email,
      photoUrl: s.photoUrl,
      joiningDate: s.joiningDate,
      passwordHash: null,
      canLogin: false,
      status: s.isActive ? 'active' : 'inactive',
    });

    const [mem] = await hairDb
      .insert(wfEngineMemberships)
      .values({
        employeeId: s.id,
        engineId: 'fyh_salon',
        rank,
        jobRole,
        isActive: s.isActive,
        defaultCommissionType: s.defaultCommissionType,
        defaultCommissionFixedPaise: s.defaultCommissionFixedPaise,
        defaultCommissionPercentBps: s.defaultCommissionPercentBps,
        performanceTargetPaise: s.performanceTargetPaise,
      })
      .returning();

    await hairDb.insert(wfPermissionGrants).values({
      membershipId: mem!.id,
      permissions: grants.permissions,
      maxBackdateDays: grants.maxBackdateDays,
    });

    await publishEmployeeEvent({
      eventType: 'employee.created',
      employeeId: s.id,
      engineId: 'fyh_salon',
      payload: { source: 'migrateHairToWorkforce', legacyStaff: true },
      sourceRef: 'workforce.migrate.staff',
    });

    staffMigrated += 1;
    notes.push(`migrated staff ${s.fullName} → ${s.id}`);
  }

  const schedules = await hairDb.select().from(fyhStaffSchedules);
  for (const sch of schedules) {
    const [emp] = await hairDb
      .select({ id: wfEmployees.id })
      .from(wfEmployees)
      .where(eq(wfEmployees.id, sch.staffId))
      .limit(1);
    if (!emp) {
      notes.push(`skip schedule — no employee for staff ${sch.staffId}`);
      continue;
    }
    if (opts.dryRun) {
      schedulesMigrated += 1;
      continue;
    }
    await hairDb
      .insert(wfSchedules)
      .values({
        employeeId: emp.id,
        engineId: 'fyh_salon',
        dayOfWeek: sch.dayOfWeek,
        startTime: sch.startTime,
        endTime: sch.endTime,
        lunchStart: sch.lunchStart,
        lunchEnd: sch.lunchEnd,
        isOff: sch.isOff,
      })
      .onConflictDoNothing();
    schedulesMigrated += 1;
  }

  return {
    dryRun: opts.dryRun,
    adminsMigrated,
    staffMigrated,
    schedulesMigrated,
    ownerEmployeeId,
    notes,
  };
}

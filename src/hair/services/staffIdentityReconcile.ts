import { and, eq, inArray, sql } from 'drizzle-orm';
import type { createHairClient } from '@/src/hair/db/client';
import { fyhAdminUsers, fyhStaff } from '@/src/hair/db/schema';
import { orgFilter } from '@/src/hair/lib/tenant/filters';
import {
  ARSHAD_ADMIN_EMAIL,
  ARSHAD_STAFF_DISPLAY_NAME,
  isArshadNameCluster,
  isPosExcludedStaff,
  LEGACY_FYH_ADMIN_EMAIL,
  normalizeStaffName,
} from '@/src/hair/lib/posStaffRoster';
import { SYSTEM_OWNER_PROVIDER_ID } from '@/src/workforce/services/systemOwnerProvider';

export type StaffAuditRow = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  isActive: boolean;
  joiningDate: string | null;
  attributionCount: number;
  createdAt: Date;
};

export type StaffReconcilePlan = {
  deactivate: Array<{ id: string; fullName: string; reason: string }>;
  activateCanonicalArshad: { id: string; fullName: string } | null;
  createCanonicalArshad: boolean;
  adminEmailMigration: {
    adminId: string;
    fromEmail: string;
    toEmail: string;
    passwordHashPrefix: string;
  } | null;
  selectableActiveAfter: string[];
};

type HairDb = ReturnType<typeof createHairClient>['db'];

export function pickPreferredStaffRow(rows: StaffAuditRow[]): StaffAuditRow {
  return [...rows].sort((a, b) => {
    if (b.attributionCount !== a.attributionCount) return b.attributionCount - a.attributionCount;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  })[0]!;
}

export function planStaffIdentityReconcile(input: {
  staff: StaffAuditRow[];
  admin: { id: string; email: string; passwordHash: string } | null;
}): StaffReconcilePlan {
  const deactivate: StaffReconcilePlan['deactivate'] = [];
  const activeStaff = input.staff.filter((s) => s.isActive);

  for (const row of activeStaff) {
    if (isPosExcludedStaff(row)) {
      deactivate.push({
        id: row.id,
        fullName: row.fullName,
        reason: 'integration_or_system_placeholder',
      });
    }
  }

  const arshadCluster = activeStaff.filter(
    (s) =>
      !isPosExcludedStaff(s) &&
      (isArshadNameCluster(s.fullName) || s.id === SYSTEM_OWNER_PROVIDER_ID),
  );
  const canonicalArshad =
    arshadCluster.length > 0 ? pickPreferredStaffRow(arshadCluster) : null;

  for (const row of activeStaff.filter((s) => isArshadNameCluster(s.fullName) || s.id === SYSTEM_OWNER_PROVIDER_ID)) {
    if (canonicalArshad && row.id !== canonicalArshad.id) {
      deactivate.push({
        id: row.id,
        fullName: row.fullName,
        reason: 'duplicate_arshad_identity',
      });
    }
  }

  const byName = new Map<string, StaffAuditRow[]>();
  for (const row of activeStaff) {
    if (deactivate.some((d) => d.id === row.id)) continue;
    const key = normalizeStaffName(row.fullName);
    const group = byName.get(key) ?? [];
    group.push(row);
    byName.set(key, group);
  }
  for (const [name, group] of byName) {
    if (group.length <= 1) continue;
    const keep = pickPreferredStaffRow(group);
    for (const row of group) {
      if (row.id === keep.id) continue;
      deactivate.push({
        id: row.id,
        fullName: row.fullName,
        reason: `duplicate_active_name:${name}`,
      });
    }
  }

  const deactivateIds = new Set(deactivate.map((d) => d.id));
  const selectableActiveAfter = activeStaff
    .filter((s) => !deactivateIds.has(s.id))
    .map((s) => (canonicalArshad && s.id === canonicalArshad.id ? ARSHAD_STAFF_DISPLAY_NAME : s.fullName))
    .filter((name, idx, arr) => arr.indexOf(name) === idx)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  let adminEmailMigration: StaffReconcilePlan['adminEmailMigration'] = null;
  if (input.admin && input.admin.email.toLowerCase() === LEGACY_FYH_ADMIN_EMAIL) {
    adminEmailMigration = {
      adminId: input.admin.id,
      fromEmail: input.admin.email,
      toEmail: ARSHAD_ADMIN_EMAIL,
      passwordHashPrefix: input.admin.passwordHash.slice(0, 12),
    };
  }

  return {
    deactivate: [...new Map(deactivate.map((d) => [d.id, d])).values()],
    activateCanonicalArshad: canonicalArshad
      ? { id: canonicalArshad.id, fullName: ARSHAD_STAFF_DISPLAY_NAME }
      : null,
    createCanonicalArshad: !canonicalArshad,
    adminEmailMigration,
    selectableActiveAfter: adminEmailMigration
      ? selectableActiveAfter.includes(ARSHAD_STAFF_DISPLAY_NAME)
        ? selectableActiveAfter
        : [...selectableActiveAfter, ARSHAD_STAFF_DISPLAY_NAME].sort((a, b) =>
            a.localeCompare(b, undefined, { sensitivity: 'base' }),
          )
      : selectableActiveAfter,
  };
}

export async function auditStaffIdentity(db: HairDb): Promise<{
  staff: StaffAuditRow[];
  admin: { id: string; email: string; passwordHash: string; role: string; displayName: string | null } | null;
}> {
  const staffRows = await db
    .select({
      id: fyhStaff.id,
      fullName: fyhStaff.fullName,
      email: fyhStaff.email,
      phone: fyhStaff.phone,
      role: fyhStaff.role,
      isActive: fyhStaff.isActive,
      joiningDate: fyhStaff.joiningDate,
      createdAt: fyhStaff.createdAt,
      attributionCount: sql<number>`(
        SELECT count(*)::int
        FROM fyh_invoice_line_attributions a
        WHERE a.staff_id = ${fyhStaff.id}
      )`.as('attribution_count'),
    })
    .from(fyhStaff)
    .orderBy(fyhStaff.fullName);

  const staff = staffRows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    role: row.role,
    isActive: row.isActive,
    joiningDate: row.joiningDate,
    attributionCount: Number(row.attributionCount ?? 0),
    createdAt: row.createdAt,
  }));

  const [admin] = await db
    .select({
      id: fyhAdminUsers.id,
      email: fyhAdminUsers.email,
      passwordHash: fyhAdminUsers.passwordHash,
      role: fyhAdminUsers.role,
      displayName: fyhAdminUsers.displayName,
    })
    .from(fyhAdminUsers)
    .where(eq(fyhAdminUsers.role, 'super_admin'))
    .limit(1);

  return { staff, admin: admin ?? null };
}

export async function reconcileStaffIdentity(
  db: HairDb,
  { dryRun = true }: { dryRun?: boolean } = {},
): Promise<{ plan: StaffReconcilePlan; applied: boolean; adminPasswordHashPrefixAfter: string | null }> {
  const audit = await auditStaffIdentity(db);
  const plan = planStaffIdentityReconcile({
    staff: audit.staff,
    admin: audit.admin
      ? {
          id: audit.admin.id,
          email: audit.admin.email,
          passwordHash: audit.admin.passwordHash,
        }
      : null,
  });

  if (dryRun) {
    return {
      plan,
      applied: false,
      adminPasswordHashPrefixAfter: audit.admin?.passwordHash.slice(0, 12) ?? null,
    };
  }

  const now = new Date();
  const deactivateIds = [...new Set(plan.deactivate.map((d) => d.id))];
  if (deactivateIds.length > 0) {
    await db
      .update(fyhStaff)
      .set({ isActive: false, updatedAt: now })
      .where(inArray(fyhStaff.id, deactivateIds));
  }

  if (plan.activateCanonicalArshad) {
    await db
      .update(fyhStaff)
      .set({
        fullName: ARSHAD_STAFF_DISPLAY_NAME,
        isActive: true,
        updatedAt: now,
      })
      .where(eq(fyhStaff.id, plan.activateCanonicalArshad.id));
  } else if (plan.createCanonicalArshad) {
    const orgId = audit.staff[0]?.id
      ? (
          await db
            .select({ organizationId: fyhStaff.organizationId })
            .from(fyhStaff)
            .limit(1)
        )[0]?.organizationId
      : audit.admin
        ? (
            await db
              .select({ organizationId: fyhAdminUsers.organizationId })
              .from(fyhAdminUsers)
              .where(eq(fyhAdminUsers.id, audit.admin.id))
              .limit(1)
          )[0]?.organizationId
        : null;
    if (!orgId) throw new Error('Cannot create Arshad staff — organization_id unknown');

    await db.insert(fyhStaff).values({
      organizationId: orgId,
      fullName: ARSHAD_STAFF_DISPLAY_NAME,
      isActive: true,
    });
  }

  if (plan.adminEmailMigration) {
    const beforeHash = audit.admin!.passwordHash;
    await db
      .update(fyhAdminUsers)
      .set({
        email: plan.adminEmailMigration.toEmail,
        displayName: ARSHAD_STAFF_DISPLAY_NAME,
      })
      .where(
        and(
          eq(fyhAdminUsers.id, plan.adminEmailMigration.adminId),
          eq(fyhAdminUsers.email, plan.adminEmailMigration.fromEmail),
        ),
      );

    const [afterAdmin] = await db
      .select({ passwordHash: fyhAdminUsers.passwordHash, email: fyhAdminUsers.email })
      .from(fyhAdminUsers)
      .where(eq(fyhAdminUsers.id, plan.adminEmailMigration.adminId))
      .limit(1);

    if (!afterAdmin || afterAdmin.passwordHash !== beforeHash) {
      throw new Error('Admin password hash changed during email migration — aborting');
    }
    if (afterAdmin.email !== plan.adminEmailMigration.toEmail) {
      throw new Error('Admin email migration did not apply');
    }
  }

  const afterAudit = await auditStaffIdentity(db);
  return {
    plan,
    applied: true,
    adminPasswordHashPrefixAfter: afterAudit.admin?.passwordHash.slice(0, 12) ?? null,
  };
}

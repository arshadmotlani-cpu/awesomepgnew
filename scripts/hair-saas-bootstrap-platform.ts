/* eslint-disable no-console */
/**
 * Phase 0B S4 — Bootstrap Platform org/location/users/memberships from Hair.
 * Staging: requireStagingEnv(). Production cutover: CONFIRM_PRODUCTION_CUTOVER=1 + production gate.
 * Writes production-bootstrap-ids.json or staging-bootstrap-ids.json artifact.
 */
import { writeFileSync } from 'node:fs';
import { and, eq, isNull } from 'drizzle-orm';
import {
  bootstrapArtifactPath,
  isProductionCutoverWrite,
  requireProductionCutoverWriteEnv,
} from '@/src/lib/db/loadProductionCutoverEnv';
import { requireStagingEnv } from '@/src/lib/db/loadStagingEnv';
import { createHairClient } from '@/src/hair/db/client';
import { createPlatformClient } from '@/src/platform/db/client';
import { fyhAdminUsers, fyhSettings } from '@/src/hair/db/schema';
import { wfEmployees, wfEngineMemberships } from '@/src/workforce/db/schema';
import { resolvePlatformAccessRoleFromWorkforce } from '@/src/platform/lib/bootstrapAccessRole';
import {
  OWNER_SALON_ORG_SLUG,
  OWNER_SALON_PLAN_SLUGS,
} from '@/src/platform/lib/ownerSalonTenant';
import { resolveCreateSubscriptionPeriod } from '@/src/platform/lib/subscriptionTrial';
import type { PlatformMembershipRole } from '@/src/platform/db/schema';
import {
  platformLocations,
  platformMembershipLocations,
  platformMemberships,
  platformOrganizations,
  platformOrganizationSubscriptions,
  platformPlans,
  platformUsers,
} from '@/src/platform/db/schema';
import { standardSalonPlanLimits } from '@/src/platform/lib/salonSubscriptionPricing';

if (isProductionCutoverWrite()) {
  requireProductionCutoverWriteEnv();
} else {
  requireStagingEnv();
}

const ARTIFACT = bootstrapArtifactPath();

async function main() {
  const hair = createHairClient({ max: 2 });
  const platform = createPlatformClient({ max: 2 });

  const [settings] = await hair.db
    .select()
    .from(fyhSettings)
    .where(isNull(fyhSettings.organizationId))
    .orderBy(fyhSettings.id)
    .limit(1);
  if (!settings) throw new Error('Canonical fyh_settings row missing (organization_id IS NULL)');

  const slug = OWNER_SALON_ORG_SLUG;
  const planSlug = isProductionCutoverWrite()
    ? OWNER_SALON_PLAN_SLUGS.production
    : OWNER_SALON_PLAN_SLUGS.staging;
  const planName = isProductionCutoverWrite() ? 'FYHAIR Production' : 'FYH Staging';

  const existing = await platform.db
    .select()
    .from(platformOrganizations)
    .where(eq(platformOrganizations.slug, slug))
    .limit(1);

  if (existing.length > 0) {
    console.log('Bootstrap org already exists — loading artifact from DB');
    const org = existing[0]!;
    const [loc] = await platform.db
      .select()
      .from(platformLocations)
      .where(eq(platformLocations.organizationId, org.id))
      .limit(1);
    await hair.close();
    await platform.close();
    writeFileSync(
      ARTIFACT,
      JSON.stringify({ organizationId: org.id, locationId: loc?.id, userMap: {} }, null, 2),
    );
    console.log(`✓ Artifact refreshed at ${ARTIFACT}`);
    return;
  }

  let [plan] = await platform.db
    .select()
    .from(platformPlans)
    .where(eq(platformPlans.slug, planSlug))
    .limit(1);
  if (!plan) {
    [plan] = await platform.db
      .insert(platformPlans)
      .values({
        slug: planSlug,
        name: planName,
        limits: standardSalonPlanLimits({ locations: 1, seats: 50 }),
      })
      .returning();
  } else {
    const existingLimits = (plan.limits as Record<string, unknown>) ?? {};
    const nextLimits = standardSalonPlanLimits(existingLimits);
    const [updated] = await platform.db
      .update(platformPlans)
      .set({ limits: nextLimits })
      .where(eq(platformPlans.id, plan.id))
      .returning();
    if (updated) plan = updated;
  }
  if (!plan) throw new Error('Failed to create plan');

  const [org] = await platform.db
    .insert(platformOrganizations)
    .values({
      slug,
      name: settings.businessName ?? 'For Your Hair',
      defaultTimezone: settings.timezone ?? 'Asia/Kolkata',
      gstin: settings.gstin,
    })
    .returning();
  if (!org) throw new Error('Failed to create organization');

  const [location] = await platform.db
    .insert(platformLocations)
    .values({
      organizationId: org.id,
      name: settings.businessName ? `${settings.businessName} — Main` : 'Primary',
      isPrimary: true,
      address: settings.businessAddress,
    })
    .returning();
  if (!location) throw new Error('Failed to create location');

  const employees = await hair.db
    .select({
      employee: wfEmployees,
      rank: wfEngineMemberships.rank,
      jobRole: wfEngineMemberships.jobRole,
    })
    .from(wfEmployees)
    .leftJoin(
      wfEngineMemberships,
      and(
        eq(wfEngineMemberships.employeeId, wfEmployees.id),
        eq(wfEngineMemberships.engineId, 'fyh_salon'),
        eq(wfEngineMemberships.isActive, true),
      ),
    )
    .where(and(eq(wfEmployees.canLogin, true), eq(wfEmployees.status, 'active')));

  const admins = await hair.db.select().from(fyhAdminUsers);
  const adminByEmail = new Map(admins.map((a) => [a.email.trim().toLowerCase(), a]));

  const userMap: Record<string, string> = {};
  const emailToUserId = new Map<string, string>();

  async function upsertUser(email: string, passwordHash: string | null) {
    const normalized = email.trim().toLowerCase();
    const existingUser = emailToUserId.get(normalized);
    if (existingUser) return existingUser;
    const [row] = await platform.db
      .insert(platformUsers)
      .values({ email: normalized, passwordHash })
      .onConflictDoNothing()
      .returning();
    if (row) {
      emailToUserId.set(normalized, row.id);
      return row.id;
    }
    const [found] = await platform.db
      .select()
      .from(platformUsers)
      .where(eq(platformUsers.email, normalized))
      .limit(1);
    if (!found) throw new Error(`Failed to upsert user ${normalized}`);
    emailToUserId.set(normalized, found.id);
    return found.id;
  }

  async function ensureMembership(
    userId: string,
    accessRole: PlatformMembershipRole,
  ): Promise<void> {
    const [membership] = await platform.db
      .insert(platformMemberships)
      .values({
        userId,
        organizationId: org.id,
        role: accessRole,
        accessRole,
        isActive: true,
      })
      .onConflictDoNothing()
      .returning();

    const membershipId =
      membership?.id ??
      (
        await platform.db
          .select({ id: platformMemberships.id })
          .from(platformMemberships)
          .where(
            and(
              eq(platformMemberships.userId, userId),
              eq(platformMemberships.organizationId, org.id),
            ),
          )
          .limit(1)
      )[0]?.id;

    if (membershipId) {
      await platform.db
        .insert(platformMembershipLocations)
        .values({ membershipId, locationId: location.id })
        .onConflictDoNothing();
    }
  }

  for (const row of employees) {
    const emp = row.employee;
    if (!emp.email) continue;
    const userId = await upsertUser(emp.email, emp.passwordHash);
    userMap[`employee:${emp.id}`] = userId;

    const legacyAdmin = adminByEmail.get(emp.email.trim().toLowerCase());
    const accessRole = resolvePlatformAccessRoleFromWorkforce({
      rank: row.rank,
      jobRole: row.jobRole,
      isSystemProvider: emp.isSystemProvider,
      legacyAdminRole: legacyAdmin?.role ?? null,
    });

    await ensureMembership(userId, accessRole);
  }

  for (const admin of admins) {
    const normalized = admin.email.trim().toLowerCase();
    if (emailToUserId.has(normalized)) continue;
    const userId = await upsertUser(admin.email, admin.passwordHash);
    userMap[`admin:${admin.id}`] = userId;
    const accessRole = resolvePlatformAccessRoleFromWorkforce({
      legacyAdminRole: admin.role,
    });
    await ensureMembership(userId, accessRole);
  }

  await platform.db.insert(platformOrganizationSubscriptions).values({
    organizationId: org.id,
    planId: plan.id,
    status: 'complimentary',
    ...resolveCreateSubscriptionPeriod({ subscriptionStatus: 'complimentary' }),
  });

  const artifact = {
    organizationId: org.id,
    locationId: location.id,
    invoicePrefix: settings.invoicePrefix ?? 'INV',
    invoiceNextSeq: settings.invoiceNextSeq ?? 1,
    customerCodeNextSeq: settings.customerCodeNextSeq ?? 1,
    userMap,
  };

  writeFileSync(ARTIFACT, JSON.stringify(artifact, null, 2));
  console.log(`✓ Bootstrap complete → ${ARTIFACT}`);
  console.log(`  organizationId=${org.id}`);
  console.log(`  locationId=${location.id}`);
  console.log(`  users=${Object.keys(userMap).length}`);

  await hair.close();
  await platform.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

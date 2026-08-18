/* eslint-disable no-console */
/**
 * Phase 0B S4 — Bootstrap Platform org/location/users/memberships from staging Hair.
 * Staging only. Writes staging-bootstrap-ids.json artifact.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { requireStagingEnv } from '@/src/lib/db/loadStagingEnv';

requireStagingEnv();

import { createHairClient } from '@/src/hair/db/client';
import { createPlatformClient } from '@/src/platform/db/client';
import { fyhAdminUsers, fyhSettings } from '@/src/hair/db/schema';
import { wfEmployees } from '@/src/workforce/db/schema';
import {
  platformLocations,
  platformMembershipLocations,
  platformMemberships,
  platformOrganizations,
  platformOrganizationSubscriptions,
  platformPlans,
  platformUsers,
} from '@/src/platform/db/schema';

const ARTIFACT = resolve('staging-bootstrap-ids.json');

async function main() {
  const hair = createHairClient({ max: 2 });
  const platform = createPlatformClient({ max: 2 });

  const [settings] = await hair.db.select().from(fyhSettings).limit(1);
  if (!settings) throw new Error('fyh_settings row missing');

  const slug = 'for-your-hair';
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

  const [plan] = await platform.db
    .insert(platformPlans)
    .values({ slug: 'fyh-staging', name: 'FYH Staging' })
    .returning();
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
      name: 'Primary',
      isPrimary: true,
      address: settings.businessAddress,
    })
    .returning();
  if (!location) throw new Error('Failed to create location');

  const employees = await hair.db
    .select()
    .from(wfEmployees)
    .where(and(eq(wfEmployees.canLogin, true), eq(wfEmployees.status, 'active')));

  const admins = await hair.db.select().from(fyhAdminUsers);

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

  for (const emp of employees) {
    if (!emp.email) continue;
    const userId = await upsertUser(emp.email, emp.passwordHash);
    userMap[`employee:${emp.id}`] = userId;

    const role =
      emp.isSystemProvider ? 'owner' : emp.email?.includes('arshad') ? 'owner' : 'member';

    const [membership] = await platform.db
      .insert(platformMemberships)
      .values({
        userId,
        organizationId: org.id,
        role,
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

  for (const admin of admins) {
    const userId = await upsertUser(admin.email, admin.passwordHash);
    userMap[`admin:${admin.id}`] = userId;
    await platform.db
      .insert(platformMemberships)
      .values({
        userId,
        organizationId: org.id,
        role: admin.role === 'super_admin' ? 'owner' : 'member',
        isActive: true,
      })
      .onConflictDoNothing();
  }

  await platform.db.insert(platformOrganizationSubscriptions).values({
    organizationId: org.id,
    planId: plan.id,
    status: 'active',
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

/* eslint-disable no-console */
/**
 * Staging-only SaaS smoke verification — mutates staging DBs only.
 * Requires .env.staging.local with non-production Hair + Platform URLs.
 */
import { randomUUID } from 'node:crypto';
import { requireStagingEnv } from '@/src/lib/db/loadStagingEnv';

requireStagingEnv();

process.env.FYH_SAAS_TENANT = '1';
process.env.WORKFORCE_MEMBERSHIP_AUTH = '1';

import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { hashPassword } from '@/src/lib/auth/crypto';
import { hairDb } from '@/src/hair/db/client';
import { fyhCustomers, fyhInvoices } from '@/src/hair/db/schema';
import {
  canAssignTeamRole,
  teamCapsForMembershipRole,
} from '@/src/hair/lib/auth/teamManagementAccess';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { listCustomers } from '@/src/hair/services/customers';
import { getInvoiceDetailByNumber, isPublicInvoiceLookupAllowed } from '@/src/hair/services/invoices';
import { listStaff } from '@/src/hair/services/staff';
import {
  acceptInvitation,
  createMemberInvitation,
  createOrganizationLocation,
  createOrganizationWithOwnerInvite,
  setPlatformAdminMembership,
  updateSubscription,
  upsertPlatformPlan,
  listPlatformPlans,
} from '@/src/platform/services/admin';
import { authenticatePlatformUser } from '@/src/platform/services/auth';
import {
  listActiveMembershipsForUser,
  loadMembershipForUserOrg,
} from '@/src/platform/services/memberships';
import { createPlatformClient } from '@/src/platform/db/client';
import {
  platformMembershipsSuper,
  platformUsers,
} from '@/src/platform/db/schema';

const SMOKE_PASSWORD = 'StagingSmokeTest!26';
const ADMIN_EMAIL = 'saas-staging-admin@awesomepg.test';

type CheckResult = { name: string; ok: boolean; detail?: string };

const results: CheckResult[] = [];

function check(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log(`✓ ${name}`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      results.push({ name, ok: false, detail });
      console.error(`✗ ${name}: ${detail}`);
    }
  })();
}

function tenantCtx(
  membership: Awaited<ReturnType<typeof loadMembershipForUserOrg>>,
  locationId?: string,
): TenantContext {
  if (!membership) throw new Error('membership required');
  const loc = locationId ?? membership.allowedLocationIds[0];
  if (!loc) throw new Error('location required');
  return {
    userId: membership.userId,
    organizationId: membership.organizationId,
    locationId: loc,
    membershipId: membership.membershipId,
    membershipRole: membership.accessRole as TenantContext['membershipRole'],
    allowedLocationIds: membership.allowedLocationIds,
    permissions: [],
  };
}

async function ensurePlatformSuperAdmin(): Promise<string> {
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    const admins = await db.select().from(platformMembershipsSuper);
    if (admins.length > 0) {
      const [user] = await db
        .select()
        .from(platformUsers)
        .where(eq(platformUsers.id, admins[0]!.userId))
        .limit(1);
      if (user) return user.id;
    }
    const userId = randomUUID();
    await db.insert(platformUsers).values({
      id: userId,
      email: ADMIN_EMAIL,
      passwordHash: hashPassword(SMOKE_PASSWORD),
      status: 'active',
    });
    await setPlatformAdminMembership(userId, true);
    return userId;
  } finally {
    await close();
  }
}

async function main() {
  console.log('FYH SaaS staging smoke (STAGING_ONLY)\n');

  const adminUserId = await ensurePlatformSuperAdmin();

  await check('Platform admin login', async () => {
    const login = await authenticatePlatformUser(ADMIN_EMAIL, SMOKE_PASSWORD);
    assert.equal(login.ok, true);
    if (login.ok) assert.equal(login.isPlatformAdmin, true);
  });

  const existingPlans = await listPlatformPlans();
  const existingPlan = existingPlans.find((p) => p.slug === 'saas-staging-smoke');
  const planId =
    existingPlan?.id ??
    (await upsertPlatformPlan({
      slug: 'saas-staging-smoke',
      name: 'SaaS Staging Smoke',
      limitsJson: '{"locations":5}',
    }));

  const stamp = Date.now();
  const orgASlug = `smoke-a-${stamp}`;
  const orgBSlug = `smoke-b-${stamp}`;

  let orgAId = '';
  let orgBId = '';
  let ownerUserId = '';
  let ownerBUserId = '';
  let ownerInviteToken = '';

  await check('Create organization A with owner invite', async () => {
    const created = await createOrganizationWithOwnerInvite({
      organizationName: `Smoke Org A ${stamp}`,
      slug: orgASlug,
      businessEmail: `biz-a-${stamp}@awesomepg.test`,
      firstOwnerName: 'Smoke Owner A',
      firstOwnerEmail: `owner-a-${stamp}@awesomepg.test`,
      firstOwnerPhone: '9876543210',
      primaryLocationName: 'Location A1',
      planId,
      subscriptionStatus: 'active',
      actorUserId: adminUserId,
    });
    orgAId = created.organizationId;
    ownerInviteToken = created.invitationToken;
    assert.ok(orgAId);
    assert.ok(ownerInviteToken);
  });

  await check('Owner accepts invitation', async () => {
    const accepted = await acceptInvitation({
      token: ownerInviteToken,
      fullName: 'Smoke Owner A',
      mobile: '9876543210',
      password: SMOKE_PASSWORD,
    });
    ownerUserId = accepted.userId;
    assert.equal(accepted.organizationId, orgAId);
  });

  await check('Owner membership resolves for FYHAIR', async () => {
    const membership = await loadMembershipForUserOrg(ownerUserId, orgAId);
    assert.ok(membership);
    assert.equal(membership!.accessRole, 'owner');
    assert.ok(membership!.allowedLocationIds.length >= 1);
  });

  await check('Create organization B for cross-org isolation', async () => {
    const created = await createOrganizationWithOwnerInvite({
      organizationName: `Smoke Org B ${stamp}`,
      slug: orgBSlug,
      businessEmail: `biz-b-${stamp}@awesomepg.test`,
      firstOwnerName: 'Smoke Owner B',
      firstOwnerEmail: `owner-b-${stamp}@awesomepg.test`,
      primaryLocationName: 'Location B1',
      planId,
      subscriptionStatus: 'active',
      actorUserId: adminUserId,
    });
    orgBId = created.organizationId;
    const acceptedB = await acceptInvitation({
      token: created.invitationToken,
      fullName: 'Smoke Owner B',
      password: SMOKE_PASSWORD,
    });
    ownerBUserId = acceptedB.userId;
    assert.ok(orgBId);
    assert.notEqual(orgAId, orgBId);
  });

  await check('RBAC: manager cannot assign owner/co_owner', () => {
    assert.equal(canAssignTeamRole('manager', 'owner'), false);
    assert.equal(canAssignTeamRole('manager', 'co_owner'), false);
    assert.equal(canAssignTeamRole('owner', 'manager'), true);
  });

  await check('RBAC: biller/staff cannot manage team', () => {
    assert.equal(teamCapsForMembershipRole('biller', null).canView, false);
    assert.equal(teamCapsForMembershipRole('staff', null).canView, false);
    const ownerCaps = teamCapsForMembershipRole('owner', null);
    assert.equal(ownerCaps.canView, true);
    assert.equal(ownerCaps.canInvite, true);
  });

  let locA2Id = '';
  await check('Create second location and team role invitations', async () => {
    const ownerMembership = await loadMembershipForUserOrg(ownerUserId, orgAId);
    assert.ok(ownerMembership);
    const ctx = tenantCtx(ownerMembership);
    locA2Id = await createOrganizationLocation({
      organizationId: orgAId,
      name: 'Location A2',
      address: 'Staging second site',
      isPrimary: false,
    });

    const roles = ['co_owner', 'manager', 'biller', 'staff'] as const;
    for (const role of roles) {
      const email = `${role}-a-${stamp}@awesomepg.test`;
      const { token } = await createMemberInvitation({
        organizationId: orgAId,
        email,
        accessRole: role,
        locationIds: [ctx.locationId, locA2Id],
        invitedByUserId: ownerUserId,
      });
      await acceptInvitation({
        token,
        fullName: `Smoke ${role}`,
        password: SMOKE_PASSWORD,
      });
    }
    assert.ok(locA2Id);
  });

  await check('Organization switching lists scoped memberships', async () => {
    const memberships = await listActiveMembershipsForUser(ownerUserId);
    const orgIds = memberships.map((m) => m.organizationId);
    assert.ok(orgIds.includes(orgAId));
    assert.ok(!orgIds.includes(orgBId));
  });

  await check('Cross-organization customer isolation', async () => {
    const ownerMembership = await loadMembershipForUserOrg(ownerUserId, orgAId);
    const ownerBMembership = await loadMembershipForUserOrg(ownerBUserId, orgBId);
    assert.ok(ownerMembership);
    assert.ok(ownerBMembership);

    const ctxA = tenantCtx(ownerMembership);
    const ctxB = tenantCtx(ownerBMembership);

    const [custA] = await hairDb
      .insert(fyhCustomers)
      .values({
        organizationId: orgAId,
        customerCode: `SA-${stamp}`,
        fullName: 'Customer A',
        phone: '9000000001',
        isActive: true,
      })
      .returning();
    const [custB] = await hairDb
      .insert(fyhCustomers)
      .values({
        organizationId: orgBId,
        customerCode: `SB-${stamp}`,
        fullName: 'Customer B',
        phone: '9000000002',
        isActive: true,
      })
      .returning();

    const listA = await listCustomers(undefined, ctxA);
    const listB = await listCustomers(undefined, ctxB);
    assert.ok(listA.some((c) => c.id === custA!.id));
    assert.ok(!listA.some((c) => c.id === custB!.id));
    assert.ok(listB.some((c) => c.id === custB!.id));
    assert.ok(!listB.some((c) => c.id === custA!.id));
  });

  await check('Public invoice tenant isolation', async () => {
    const ownerMembership = await loadMembershipForUserOrg(ownerUserId, orgAId);
    const ownerBMembership = await loadMembershipForUserOrg(ownerBUserId, orgBId);
    assert.ok(ownerMembership);
    assert.ok(ownerBMembership);
    const ctxA = tenantCtx(ownerMembership);
    const ctxB = tenantCtx(ownerBMembership);

    assert.equal(isPublicInvoiceLookupAllowed(null), false);
    assert.equal(isPublicInvoiceLookupAllowed(ctxA), true);

    const invA = `INV-A-${stamp}`;
    const invB = `INV-B-${stamp}`;
    await hairDb.insert(fyhInvoices).values({
      organizationId: orgAId,
      locationId: ctxA.locationId,
      customerId: (
        await hairDb
          .select({ id: fyhCustomers.id })
          .from(fyhCustomers)
          .where(eq(fyhCustomers.organizationId, orgAId))
          .limit(1)
      )[0]!.id,
      invoiceNumber: invA,
      status: 'paid',
      grandTotalPaise: 10000,
      amountPaidPaise: 10000,
      subtotalPaise: 10000,
      taxPaise: 0,
      discountPaise: 0,
    });
    await hairDb.insert(fyhInvoices).values({
      organizationId: orgBId,
      locationId: ctxB.locationId,
      customerId: (
        await hairDb
          .select({ id: fyhCustomers.id })
          .from(fyhCustomers)
          .where(eq(fyhCustomers.organizationId, orgBId))
          .limit(1)
      )[0]!.id,
      invoiceNumber: invB,
      status: 'paid',
      grandTotalPaise: 20000,
      amountPaidPaise: 20000,
      subtotalPaise: 20000,
      taxPaise: 0,
      discountPaise: 0,
    });

    const hitA = await getInvoiceDetailByNumber(invA, ctxA);
    const leakB = await getInvoiceDetailByNumber(invB, ctxA);
    assert.ok(hitA);
    assert.equal(leakB, null);
  });

  await check('Workforce list scoped to organization', async () => {
    const ownerMembership = await loadMembershipForUserOrg(ownerUserId, orgAId);
    assert.ok(ownerMembership);
    const ctxA = tenantCtx(ownerMembership);
    const staffA = await listStaff(false, ctxA);
    assert.ok(staffA.every((s) => s.organizationId === orgAId || s.organizationId === null));
  });

  await check('Subscription suspension blocks salon access', async () => {
    await updateSubscription({
      organizationId: orgAId,
      planId,
      status: 'suspended',
      actorUserId: adminUserId,
    });
    const blocked = await loadMembershipForUserOrg(ownerUserId, orgAId);
    assert.equal(blocked, null);
    await updateSubscription({
      organizationId: orgAId,
      planId,
      status: 'active',
      actorUserId: adminUserId,
    });
    const restored = await loadMembershipForUserOrg(ownerUserId, orgAId);
    assert.ok(restored);
  });

  const failed = results.filter((r) => !r.ok);
  console.log('\n── Summary ──');
  console.log(`Passed: ${results.length - failed.length}/${results.length}`);
  if (failed.length > 0) {
    console.error('Failed checks:');
    for (const f of failed) console.error(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  console.log('All staging SaaS smoke checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

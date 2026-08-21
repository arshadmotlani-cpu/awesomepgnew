/* eslint-disable no-console */
/**
 * Post-reset staging verification — tenant isolation, RBAC, subscription gating.
 * Uses fyhair-test org; creates temporary org B for isolation then removes B data only.
 */
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import {
  getResolvedHairHost,
  PRODUCTION_HAIR_HOST_FRAGMENT,
  requireStagingEnv,
} from '@/src/lib/db/loadStagingEnv';
import { getPlatformDatabaseHost } from '@/src/platform/lib/db/env';

requireStagingEnv();

process.env.FYH_SAAS_TENANT = '1';
process.env.WORKFORCE_MEMBERSHIP_AUTH = '1';

import { createHairClient } from '@/src/hair/db/client';
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
  createOrganizationWithOwnerInvite,
  listPlatformPlans,
  updateSubscription,
} from '@/src/platform/services/admin';
import { authenticatePlatformUser } from '@/src/platform/services/auth';
import {
  loadMembershipForUserOrg,
  listActiveMembershipsForUser,
} from '@/src/platform/services/memberships';
import { createPlatformClient } from '@/src/platform/db/client';
import { platformOrganizations, platformUsers } from '@/src/platform/db/schema';
import { acceptInvitation } from '@/src/platform/services/admin';

const ADMIN_EMAIL = 'saas-staging-admin@awesomepg.test';
const ADMIN_PASSWORD = 'StagingSmokeTest!26';
const OWNER_EMAIL = 'owner@fyhair-test.awesomepg.test';
const TEST_SLUG = 'fyhair-test';

type Check = { name: string; ok: boolean; detail?: string };
const results: Check[] = [];

function record(name: string, fn: () => void | Promise<void>) {
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
  membership: NonNullable<Awaited<ReturnType<typeof loadMembershipForUserOrg>>>,
  locationId?: string,
): TenantContext {
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

function pickCount(result: unknown): number {
  const row = Array.isArray(result)
    ? result[0]
    : (result as { rows?: Array<{ c: number }> }).rows?.[0];
  return Number(row?.c ?? 0);
}

async function deleteOrganizationData(organizationId: string) {
  const hair = createHairClient({ max: 1 });
  const platform = createPlatformClient({ max: 1 });
  try {
    const tableRows = await hair.db.execute<{ tablename: string }>(
      sql.raw(`
        SELECT DISTINCT c.table_name AS tablename
        FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.column_name = 'organization_id'
      `),
    );
    const tables = (Array.isArray(tableRows) ? tableRows : tableRows.rows ?? []).map(
      (r) => r.tablename,
    );
    for (let pass = 0; pass < 10; pass++) {
      for (const table of tables) {
        try {
          await hair.db.execute(
            sql.raw(`DELETE FROM "${table}" WHERE organization_id = '${organizationId}'`),
          );
        } catch {
          /* FK order — retry */
        }
      }
    }
    await platform.db.execute(
      sql.raw(`DELETE FROM platform.subscription_events WHERE organization_id = '${organizationId}'`),
    );
    await platform.db.execute(
      sql.raw(`DELETE FROM platform.invitations WHERE organization_id = '${organizationId}'`),
    );
    await platform.db.execute(sql.raw(`
      DELETE FROM platform.membership_locations
      WHERE membership_id IN (SELECT id FROM platform.memberships WHERE organization_id = '${organizationId}')
    `));
    await platform.db.execute(
      sql.raw(`DELETE FROM platform.memberships WHERE organization_id = '${organizationId}'`),
    );
    await platform.db.execute(
      sql.raw(`DELETE FROM platform.organization_entitlements WHERE organization_id = '${organizationId}'`),
    );
    await platform.db.execute(
      sql.raw(`DELETE FROM platform.organization_subscriptions WHERE organization_id = '${organizationId}'`),
    );
    await platform.db.execute(
      sql.raw(`DELETE FROM platform.locations WHERE organization_id = '${organizationId}'`),
    );
    await platform.db.execute(
      sql.raw(`DELETE FROM platform.organizations WHERE id = '${organizationId}'`),
    );
  } finally {
    await hair.close();
    await platform.close();
  }
}

async function main() {
  const hairHost = getResolvedHairHost();
  const platformHost = getPlatformDatabaseHost();
  console.log('Staging verify hosts:');
  console.log(`  Hair: ${hairHost}`);
  console.log(`  Platform: ${platformHost}`);
  if (hairHost?.includes(PRODUCTION_HAIR_HOST_FRAGMENT)) {
    throw new Error('Production Hair host detected — aborting');
  }

  const { db, close } = createPlatformClient({ max: 1 });
  const [testOrg] = await db
    .select()
    .from(platformOrganizations)
    .where(eq(platformOrganizations.slug, TEST_SLUG))
    .limit(1);
  await close();
  if (!testOrg) throw new Error(`Missing test org slug ${TEST_SLUG} — run staging reset first`);

  const [ownerUser] = await (async () => {
    const { db, close } = createPlatformClient({ max: 1 });
    const rows = await db.select().from(platformUsers).where(eq(platformUsers.email, OWNER_EMAIL)).limit(1);
    await close();
    return rows;
  })();
  if (!ownerUser) throw new Error('Test owner user missing');

  const adminLogin = await authenticatePlatformUser(ADMIN_EMAIL, ADMIN_PASSWORD);
  await record('Platform admin login', () => {
    assert.equal(adminLogin.ok, true);
    if (adminLogin.ok) assert.equal(adminLogin.isPlatformAdmin, true);
  });

  const ownerLogin = await authenticatePlatformUser(OWNER_EMAIL, ADMIN_PASSWORD);
  await record('Owner login', () => {
    assert.equal(ownerLogin.ok, true);
    if (ownerLogin.ok) assert.equal(ownerLogin.isPlatformAdmin, false);
  });

  let ownerMembership: Awaited<ReturnType<typeof loadMembershipForUserOrg>> = null;
  await record('Owner membership for test org', async () => {
    ownerMembership = await loadMembershipForUserOrg(ownerUser.id, testOrg.id);
    assert.ok(ownerMembership);
    assert.equal(ownerMembership!.accessRole, 'owner');
  });

  await record('RBAC: manager cannot assign owner', () => {
    assert.equal(canAssignTeamRole('manager', 'owner'), false);
    assert.equal(teamCapsForMembershipRole('biller', null).canView, false);
    assert.equal(teamCapsForMembershipRole('owner', null).canInvite, true);
  });

  const plans = await listPlatformPlans();
  const planId = plans[0]?.id;
  if (!planId) throw new Error('No platform plan');

  let orgBId = '';
  let ownerBUserId = '';
  const stamp = Date.now();

  const adminUserId = adminLogin.ok ? adminLogin.userId : ownerUser.id;

  await record('Cross-org isolation (temp org B)', async () => {
    assert.ok(ownerMembership);
    const created = await createOrganizationWithOwnerInvite({
      organizationName: `Isolation B ${stamp}`,
      slug: `isolation-b-${stamp}`,
      businessEmail: `biz-b-${stamp}@awesomepg.test`,
      firstOwnerName: 'Isolation B',
      firstOwnerEmail: `owner-b-${stamp}@awesomepg.test`,
      primaryLocationName: 'B Loc',
      planId,
      subscriptionStatus: 'active',
      actorUserId: adminUserId,
    });
    orgBId = created.organizationId;
    const accepted = await acceptInvitation({
      token: created.invitationToken,
      fullName: 'Isolation B',
      password: ADMIN_PASSWORD,
    });
    ownerBUserId = accepted.userId;

    const memA = await loadMembershipForUserOrg(ownerUser.id, testOrg.id);
    const memB = await loadMembershipForUserOrg(ownerBUserId, orgBId);
    assert.ok(memA && memB);
    const ctxA = tenantCtx(memA);
    const ctxB = tenantCtx(memB);

    const [custA] = await hairDb
      .insert(fyhCustomers)
      .values({
        organizationId: testOrg.id,
        customerCode: `TA-${stamp}`,
        fullName: 'Test A Customer',
        phone: '9000000100',
        isActive: true,
      })
      .returning();
    const [custB] = await hairDb
      .insert(fyhCustomers)
      .values({
        organizationId: orgBId,
        customerCode: `TB-${stamp}`,
        fullName: 'Test B Customer',
        phone: '9000000200',
        isActive: true,
      })
      .returning();

    const listA = await listCustomers(undefined, ctxA);
    const listB = await listCustomers(undefined, ctxB);
    assert.ok(listA.some((c) => c.id === custA!.id));
    assert.ok(!listA.some((c) => c.id === custB!.id));
    assert.ok(listB.some((c) => c.id === custB!.id));
    assert.ok(!listB.some((c) => c.id === custA!.id));

    const invA = `INV-TA-${stamp}`;
    const invB = `INV-TB-${stamp}`;
    await hairDb.insert(fyhInvoices).values({
      organizationId: testOrg.id,
      locationId: ctxA.locationId,
      customerId: custA!.id,
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
      customerId: custB!.id,
      invoiceNumber: invB,
      status: 'paid',
      grandTotalPaise: 20000,
      amountPaidPaise: 20000,
      subtotalPaise: 20000,
      taxPaise: 0,
      discountPaise: 0,
    });
    assert.ok(await getInvoiceDetailByNumber(invA, ctxA));
    assert.equal(await getInvoiceDetailByNumber(invB, ctxA), null);
    assert.equal(isPublicInvoiceLookupAllowed(ctxA), true);
    assert.equal(isPublicInvoiceLookupAllowed(null), false);

    const staffA = await listStaff(false, ctxA);
    assert.ok(staffA.every((s) => s.organizationId === testOrg.id || s.organizationId === null));
  });

  if (orgBId) {
    await deleteOrganizationData(orgBId);
    console.log(`✓ Temp isolation org B removed (${orgBId})`);
  }

  await record('Subscription gating suspend/restore', async () => {
    await updateSubscription({
      organizationId: testOrg.id,
      planId,
      status: 'suspended',
      actorUserId: ownerUser.id,
    });
    assert.equal(await loadMembershipForUserOrg(ownerUser.id, testOrg.id), null);
    await updateSubscription({
      organizationId: testOrg.id,
      planId,
      status: 'active',
      actorUserId: ownerUser.id,
    });
    assert.ok(await loadMembershipForUserOrg(ownerUser.id, testOrg.id));
  });

  await record('Owner org switch list scoped', async () => {
    const memberships = await listActiveMembershipsForUser(ownerUser.id);
    assert.ok(memberships.some((m) => m.organizationId === testOrg.id));
    assert.ok(!memberships.some((m) => m.organizationId === orgBId));
  });

  const hair = createHairClient({ max: 1 });
  const platform = createPlatformClient({ max: 1 });
  const counts = {
    orgs: pickCount(await platform.db.execute(sql.raw('SELECT COUNT(*)::int AS c FROM platform.organizations'))),
    users: pickCount(await platform.db.execute(sql.raw('SELECT COUNT(*)::int AS c FROM platform.users'))),
    customers: pickCount(await hair.db.execute(sql.raw('SELECT COUNT(*)::int AS c FROM fyh_customers'))),
    invoices: pickCount(await hair.db.execute(sql.raw('SELECT COUNT(*)::int AS c FROM fyh_invoices'))),
  };
  await hair.close();
  await platform.close();
  console.log('\n── Counts after verify ──', counts);

  const failed = results.filter((r) => !r.ok);
  console.log(`\nPassed: ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    for (const f of failed) console.error(`  FAIL: ${f.name} — ${f.detail}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

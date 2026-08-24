/* eslint-disable no-console */
/**
 * STAGING ONLY — wipe SaaS tenant + Hair business DATA (not schema).
 * Requires CONFIRM_STAGING_RESET=1 and staging safety gate (non-production hosts).
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  assertStagingHairNotProduction,
  assertStagingPlatformConfigured,
  getResolvedHairHost,
  requireStagingEnv,
  PRODUCTION_HAIR_HOST_FRAGMENT,
} from '@/src/lib/db/loadStagingEnv';
import { getPlatformDatabaseHost } from '@/src/platform/lib/db/env';
import { hashPassword } from '@/src/lib/auth/crypto';
import { createHairClient } from '@/src/hair/db/client';
import { createPlatformClient } from '@/src/platform/db/client';
import {
  acceptInvitation,
  createOrganizationWithOwnerInvite,
  listPlatformPlans,
  setPlatformAdminMembership,
  upsertPlatformPlan,
} from '@/src/platform/services/admin';
import { platformUsers } from '@/src/platform/db/schema';

const ADMIN_EMAIL = 'saas-staging-admin@awesomepg.test';
const ADMIN_PASSWORD = 'StagingSmokeTest!26';

const EXPECTED_HAIR_HOST_FRAGMENT = 'ep-noisy-forest';
const EXPECTED_PLATFORM_HOST_FRAGMENT = 'ep-green-feather';

const TEST_ORG = {
  name: 'FYHAIR Test Salon',
  slug: 'fyhair-test',
  businessEmail: 'contact@fyhair-test.awesomepg.test',
  locationName: 'Main Salon',
  ownerName: 'FYHAIR Test Owner',
  ownerEmail: 'owner@fyhair-test.awesomepg.test',
  ownerPhone: '9876500001',
};

requireStagingEnv();

process.env.FYH_SAAS_TENANT = '1';
process.env.WORKFORCE_MEMBERSHIP_AUTH = '1';

function assertStagingHosts() {
  const hairHost = getResolvedHairHost();
  const platformHost = getPlatformDatabaseHost();
  if (!hairHost || !platformHost) {
    throw new Error('Hair or Platform host missing after staging env load');
  }
  console.log('TARGET DATABASE HOSTS (staging only):');
  console.log(`  Hair:     ${hairHost}`);
  console.log(`  Platform: ${platformHost}`);
  console.log(`  Production Hair blocked fragment: ${PRODUCTION_HAIR_HOST_FRAGMENT}`);

  if (hairHost.includes(PRODUCTION_HAIR_HOST_FRAGMENT)) {
    throw new Error(`Refusing: Hair host matches production (${PRODUCTION_HAIR_HOST_FRAGMENT})`);
  }
  if (!hairHost.includes(EXPECTED_HAIR_HOST_FRAGMENT)) {
    throw new Error(
      `Refusing: Hair host does not match expected staging (${EXPECTED_HAIR_HOST_FRAGMENT})`,
    );
  }
  if (!platformHost.includes(EXPECTED_PLATFORM_HOST_FRAGMENT)) {
    throw new Error(
      `Refusing: Platform host does not match expected staging (${EXPECTED_PLATFORM_HOST_FRAGMENT})`,
    );
  }
  assertStagingHairNotProduction();
  assertStagingPlatformConfigured();
}

function pickCount(result: unknown): number {
  const row = Array.isArray(result)
    ? result[0]
    : (result as { rows?: Array<{ c: number }> }).rows?.[0];
  return Number(row?.c ?? 0);
}

async function wipePlatformTenantData() {
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    await db.execute(sql.raw('DELETE FROM platform.subscription_events'));
    await db.execute(sql.raw('DELETE FROM platform.invitations'));
    await db.execute(sql.raw('DELETE FROM platform.membership_locations'));
    await db.execute(sql.raw('DELETE FROM platform.memberships'));
    await db.execute(sql.raw('DELETE FROM platform.organization_entitlements'));
    await db.execute(sql.raw('DELETE FROM platform.organization_subscriptions'));
    await db.execute(sql.raw('DELETE FROM platform.locations'));
    await db.execute(sql.raw('DELETE FROM platform.organizations'));
    await db.execute(sql.raw('DELETE FROM platform.platform_memberships'));
    await db.execute(sql.raw('DELETE FROM platform.users'));
    console.log('✓ Platform tenant data deleted (plans preserved)');
  } finally {
    await close();
  }
}

async function wipeHairBusinessData() {
  const hair = createHairClient({ max: 1 });
  try {
    const tableRows = await hair.db.execute<{ tablename: string }>(
      sql.raw(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND (tablename LIKE 'fyh_%' OR tablename LIKE 'wf_%')
        ORDER BY tablename
      `),
    );
    const tables = (Array.isArray(tableRows) ? tableRows : tableRows.rows ?? []).map(
      (r) => r.tablename,
    );
    if (tables.length === 0) {
      throw new Error('No fyh_/wf_ tables found — aborting Hair wipe');
    }
    const quoted = tables.map((t) => `"${t}"`).join(', ');
    await hair.db.execute(
      sql.raw(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`),
    );
    console.log(`✓ Hair business data truncated (${tables.length} tables)`);
  } finally {
    await hair.close();
  }
}

async function recreatePlatformSuperAdmin(): Promise<string> {
  const userId = randomUUID();
  const { db, close } = createPlatformClient({ max: 1 });
  try {
    await db.insert(platformUsers).values({
      id: userId,
      email: ADMIN_EMAIL,
      passwordHash: hashPassword(ADMIN_PASSWORD),
      status: 'active',
    });
    await setPlatformAdminMembership(userId, true);
    console.log(`✓ Platform super-admin recreated: ${ADMIN_EMAIL}`);
    return userId;
  } finally {
    await close();
  }
}

async function ensureDefaultPlan(): Promise<string> {
  const plans = await listPlatformPlans();
  const existing = plans.find((p) => p.slug === 'fyhair-staging-default');
  if (existing) return existing.id;
  return upsertPlatformPlan({
    slug: 'fyhair-staging-default',
    name: 'FYHAIR Staging Default',
    limitsJson: JSON.stringify({
      locations: 5,
      users: 25,
      amountPaise: 650000,
      listPricePaise: 1500000,
      billingInterval: 'year',
    }),
  });
}

async function seedTestOrganization(adminUserId: string) {
  const planId = await ensureDefaultPlan();
  const created = await createOrganizationWithOwnerInvite({
    organizationName: TEST_ORG.name,
    slug: TEST_ORG.slug,
    businessEmail: TEST_ORG.businessEmail,
    firstOwnerName: TEST_ORG.ownerName,
    firstOwnerEmail: TEST_ORG.ownerEmail,
    firstOwnerPhone: TEST_ORG.ownerPhone,
    primaryLocationName: TEST_ORG.locationName,
    primaryLocationAddress: 'Staging test salon — main location',
    planId,
    subscriptionStatus: 'active',
    actorUserId: adminUserId,
  });

  await acceptInvitation({
    token: created.invitationToken,
    fullName: TEST_ORG.ownerName,
    mobile: TEST_ORG.ownerPhone,
    password: ADMIN_PASSWORD,
  });

  console.log(`✓ Test organization provisioned: ${TEST_ORG.slug} (${created.organizationId})`);
  console.log(`  Owner: ${TEST_ORG.ownerEmail} (password same as staging admin test password)`);
  return created.organizationId;
}

async function printCounts(label: string) {
  const hair = createHairClient({ max: 1 });
  const platform = createPlatformClient({ max: 1 });
  try {
    const orgs = pickCount(
      await platform.db.execute(sql.raw('SELECT COUNT(*)::int AS c FROM platform.organizations')),
    );
    const users = pickCount(
      await platform.db.execute(sql.raw('SELECT COUNT(*)::int AS c FROM platform.users')),
    );
    const customers = pickCount(
      await hair.db.execute(sql.raw('SELECT COUNT(*)::int AS c FROM fyh_customers')),
    );
    const invoices = pickCount(
      await hair.db.execute(sql.raw('SELECT COUNT(*)::int AS c FROM fyh_invoices')),
    );
    console.log(`${label}: orgs=${orgs} platform_users=${users} customers=${customers} invoices=${invoices}`);
  } finally {
    await hair.close();
    await platform.close();
  }
}

async function main() {
  if (process.env.CONFIRM_STAGING_RESET !== '1') {
    console.error(
      'Refusing to run: set CONFIRM_STAGING_RESET=1 to wipe staging business data.',
    );
    process.exit(1);
  }

  assertStagingHosts();
  await printCounts('Before wipe');

  await wipePlatformTenantData();
  await wipeHairBusinessData();

  const adminUserId = await recreatePlatformSuperAdmin();
  await seedTestOrganization(adminUserId);

  await printCounts('After seed');
  console.log('\n✓ Staging reset complete — ONE test organization seeded.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

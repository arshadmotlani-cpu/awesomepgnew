/* eslint-disable no-console */
/**
 * Read-only: inspect platform user + org membership + hair workforce link for an email.
 * Usage: tsx scripts/hair-saas-inspect-member-readonly.ts billing@your.co
 */
import { parse } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, ilike, sql } from 'drizzle-orm';
import { createHairClient } from '@/src/hair/db/client';
import { createPlatformClient } from '@/src/platform/db/client';
import { OWNER_SALON_ORG_SLUG } from '@/src/platform/lib/ownerSalonTenant';
import {
  platformLocations,
  platformMembershipLocations,
  platformMemberships,
  platformOrganizations,
  platformUsers,
} from '@/src/platform/db/schema';
import { wfEmployees, wfEngineMemberships } from '@/src/workforce/db/schema';
import { hasPlatformDatabaseUrl } from '@/src/platform/lib/db/env';
import { getHairDatabaseHost } from '@/src/hair/lib/db/env';
import { getResolvedPlatformHost } from '@/src/lib/db/loadProductionCutoverEnv';

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const parsed = parse(readFileSync(path, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    process.env[key] = trimmed;
  }
}

const cliArgs = process.argv.slice(2);
const envFileArg = cliArgs.find((a) => a.startsWith('--env-file='))?.slice('--env-file='.length);
if (envFileArg) {
  loadEnvFile(envFileArg);
} else if (process.env.PRODUCTION_CUTOVER === '1') {
  loadEnvFile(join(process.cwd(), '.env.production-cutover.local'));
} else {
  loadEnvFile(join(process.cwd(), '.env'));
  loadEnvFile(join(process.cwd(), '.env.local'));
}

const emailArg = cliArgs.find((a) => !a.startsWith('--'))?.trim().toLowerCase();
if (!emailArg) {
  console.error('Usage: tsx scripts/hair-saas-inspect-member-readonly.ts <email>');
  process.exit(1);
}

async function main() {
  console.log(`Hair DB host: ${getHairDatabaseHost() ?? 'unknown'}`);
  console.log(`Platform DB host: ${getResolvedPlatformHost() ?? 'unknown'}`);
  if (!hasPlatformDatabaseUrl()) {
    console.error('PLATFORM_DATABASE_URL not configured');
    process.exit(1);
  }

  const platform = createPlatformClient({ max: 1 });
  const hair = createHairClient({ max: 1 });

  const [org] = await platform.db
    .select()
    .from(platformOrganizations)
    .where(eq(platformOrganizations.slug, OWNER_SALON_ORG_SLUG))
    .limit(1);
  console.log('\n=== For Your Hair organization ===');
  console.log(org ? { id: org.id, slug: org.slug, name: org.name, status: org.status } : 'NOT FOUND');

  const locations = org
    ? await platform.db
        .select()
        .from(platformLocations)
        .where(eq(platformLocations.organizationId, org.id))
    : [];
  console.log('\n=== Locations ===');
  for (const loc of locations) {
    console.log({ id: loc.id, name: loc.name, isPrimary: loc.isPrimary, status: loc.status });
  }

  const [user] = await platform.db
    .select()
    .from(platformUsers)
    .where(ilike(platformUsers.email, emailArg))
    .limit(1);
  console.log(`\n=== Platform user (${emailArg}) ===`);
  console.log(
    user
      ? { id: user.id, email: user.email, status: user.status, hasPassword: Boolean(user.passwordHash) }
      : 'NOT FOUND',
  );

  const memberships = user
    ? await platform.db
        .select({
          membership: platformMemberships,
          orgSlug: platformOrganizations.slug,
          orgName: platformOrganizations.name,
        })
        .from(platformMemberships)
        .innerJoin(
          platformOrganizations,
          eq(platformOrganizations.id, platformMemberships.organizationId),
        )
        .where(eq(platformMemberships.userId, user.id))
    : [];
  console.log('\n=== Platform memberships ===');
  if (memberships.length === 0) console.log('NONE');
  for (const row of memberships) {
    const locRows = await platform.db
      .select({ locationId: platformMembershipLocations.locationId })
      .from(platformMembershipLocations)
      .where(eq(platformMembershipLocations.membershipId, row.membership.id));
    console.log({
      membershipId: row.membership.id,
      organizationId: row.membership.organizationId,
      orgSlug: row.orgSlug,
      orgName: row.orgName,
      role: row.membership.role,
      accessRole: row.membership.accessRole,
      isActive: row.membership.isActive,
      locationIds: locRows.map((l) => l.locationId),
      isFyhOrg: org ? row.membership.organizationId === org.id : false,
    });
  }

  const [employee] = await hair.db
    .select()
    .from(wfEmployees)
    .where(ilike(wfEmployees.email, emailArg))
    .limit(1);
  console.log('\n=== Hair wf_employees ===');
  console.log(
    employee
      ? {
          id: employee.id,
          email: employee.email,
          userId: employee.userId,
          organizationId: employee.organizationId,
          canLogin: employee.canLogin,
          status: employee.status,
          legacyAdminUserId: employee.legacyAdminUserId,
        }
      : 'NOT FOUND',
  );

  if (employee) {
    const engineMemberships = await hair.db
      .select()
      .from(wfEngineMemberships)
      .where(eq(wfEngineMemberships.employeeId, employee.id));
    console.log('\n=== wf_engine_memberships ===');
    for (const em of engineMemberships) {
      console.log({
        id: em.id,
        engineId: em.engineId,
        rank: em.rank,
        jobRole: em.jobRole,
        isActive: em.isActive,
        organizationId: em.organizationId,
      });
    }
  }

  const adminRows = await hair.db.execute<{ id: string; email: string; user_id: string | null; role: string }>(
    sql.raw(
      `SELECT id, email, user_id, role FROM fyh_admin_users WHERE lower(email) = lower('${emailArg.replace(/'/g, "''")}') LIMIT 1`,
    ),
  );
  const admin = Array.isArray(adminRows) ? adminRows[0] : adminRows.rows?.[0];
  console.log('\n=== fyh_admin_users ===');
  console.log(admin ?? 'NOT FOUND');

  await hair.close();
  await platform.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

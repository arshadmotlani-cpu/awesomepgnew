/* eslint-disable no-console */
/**
 * Link an existing Hair workforce login to Platform org membership (SaaS tenant bind).
 *
 * Usage:
 *   tsx scripts/hair-saas-link-workforce-member.ts --env-file=.env.production.inspect billing@foryour.co --role=biller
 *   CONFIRM_PRODUCTION_CUTOVER=1 tsx scripts/hair-saas-link-workforce-member.ts --env-file=.env.production.inspect billing@foryour.co --role=biller --apply
 */
import { parse } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isProductionCutoverWrite,
  PRODUCTION_HAIR_HOST_FRAGMENT,
  requireProductionCutoverWriteEnv,
} from '@/src/lib/db/loadProductionCutoverEnv';
import { getHairDatabaseHost } from '@/src/hair/lib/db/env';
import { requireStagingEnv } from '@/src/lib/db/loadStagingEnv';
import { OWNER_SALON_ORG_SLUG } from '@/src/platform/lib/ownerSalonTenant';
import type { PlatformMembershipRole } from '@/src/platform/db/schema';
import {
  linkWorkforceEmployeeToPlatformOrg,
  planWorkforceEmployeePlatformLink,
} from '@/src/platform/services/linkWorkforcePlatformMembership';

function loadEnvFile(path: string): void {
  if (!existsSync(path)) throw new Error(`Env file not found: ${path}`);
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith('HAIR_DATABASE_') ||
      key.startsWith('PLATFORM_DATABASE_') ||
      key === 'HAIR_DATABASE_URL' ||
      key === 'PLATFORM_DATABASE_URL'
    ) {
      delete process.env[key];
    }
  }
  const parsed = parse(readFileSync(path, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    process.env[key] = trimmed;
  }
}

const cliArgs = process.argv.slice(2);
const envFileArg = cliArgs.find((a) => a.startsWith('--env-file='))?.slice('--env-file='.length);
const apply = cliArgs.includes('--apply');
const roleArg = cliArgs.find((a) => a.startsWith('--role='))?.slice('--role='.length) as
  | PlatformMembershipRole
  | undefined;
const orgSlugArg =
  cliArgs.find((a) => a.startsWith('--org='))?.slice('--org='.length) ?? OWNER_SALON_ORG_SLUG;
const emailArg = cliArgs.find((a) => !a.startsWith('--'))?.trim().toLowerCase();

if (envFileArg) loadEnvFile(envFileArg);
else if (isProductionCutoverWrite()) {
  requireProductionCutoverWriteEnv();
} else {
  requireStagingEnv();
}

if (!emailArg) {
  console.error(
    'Usage: tsx scripts/hair-saas-link-workforce-member.ts [--env-file=path] <email> [--org=slug] [--role=biller] [--apply]',
  );
  process.exit(1);
}

async function main() {
  const plan = await planWorkforceEmployeePlatformLink({
    employeeEmail: emailArg,
    organizationSlug: orgSlugArg,
    accessRole: roleArg,
  });

  console.log('=== Planned Platform membership repair (read-only preview) ===');
  console.log(JSON.stringify(plan, null, 2));

  if (!apply) {
    console.log('\nDry run only. Re-run with CONFIRM_PRODUCTION_CUTOVER=1 and --apply to execute.');
    return;
  }

  if (envFileArg) {
    if (process.env.CONFIRM_PRODUCTION_CUTOVER !== '1') {
      throw new Error('Refusing apply with --env-file: set CONFIRM_PRODUCTION_CUTOVER=1 explicitly.');
    }
    const hairHost = getHairDatabaseHost();
    if (!hairHost?.includes(PRODUCTION_HAIR_HOST_FRAGMENT)) {
      throw new Error(`Refusing apply: Hair host ${hairHost ?? 'unknown'} is not production.`);
    }
  } else if (isProductionCutoverWrite()) {
    requireProductionCutoverWriteEnv();
  }

  const result = await linkWorkforceEmployeeToPlatformOrg({
    employeeEmail: emailArg,
    organizationSlug: orgSlugArg,
    accessRole: roleArg,
  });

  console.log('\n=== Applied membership repair ===');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

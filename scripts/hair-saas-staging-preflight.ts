/* eslint-disable no-console */
/**
 * Read-only staging preflight for Phase 0B — does not mutate data.
 * Verifies env isolation hints and schema presence on connected DBs.
 */
import { requireStagingEnv } from '@/src/lib/db/loadStagingEnv';

requireStagingEnv();

import { sql } from 'drizzle-orm';
import { createHairClient } from '@/src/hair/db/client';
import { createPlatformClient } from '@/src/platform/db/client';
import { getHairDatabaseHost } from '@/src/hair/lib/db/env';
import { getPlatformDatabaseHost, hasPlatformDatabaseUrl } from '@/src/platform/lib/db/env';
import { assertHairDatabaseIsolated, resolveHairDatabaseUrl } from '@/src/hair/lib/db/env';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';

function warn(msg: string) {
  console.warn(`⚠ ${msg}`);
}

function ok(msg: string) {
  console.log(`✓ ${msg}`);
}

async function main() {
  console.log('Phase 0B staging preflight (read-only)\n');

  const hairHost = getHairDatabaseHost();
  console.log(`Hair DB host: ${hairHost ?? 'unknown'}`);
  if (hasPlatformDatabaseUrl()) {
    console.log(`Platform DB host: ${getPlatformDatabaseHost() ?? 'unknown'}`);
  } else {
    warn('PLATFORM_DATABASE_URL not set');
  }

  try {
    assertHairDatabaseIsolated();
    ok('Hair DB isolation check passed');
  } catch (e) {
    warn(e instanceof Error ? e.message : String(e));
  }

  console.log(`FYH_SAAS_TENANT effective: ${isFyhSaasTenantEnabled() ? 'ON' : 'OFF (default)'}`);

  const hair = createHairClient({ max: 1 });
  const orgCol = await hair.db.execute<{ exists: boolean }>(
    sql`SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'fyh_customers' AND column_name = 'organization_id'
    ) AS exists`,
  );
  const hasOrgCol = Boolean((Array.isArray(orgCol) ? orgCol[0] : orgCol)?.exists);
  if (hasOrgCol) ok('fyh_customers.organization_id column present');
  else warn('0034 migration not applied — run npm run hair:db:migrate');

  const seq = await hair.db.execute<{ c: number }>(
    sql`SELECT COUNT(*)::int AS c FROM information_schema.tables WHERE table_name = 'fyh_org_invoice_sequences'`,
  );
  const seqCount = Number((Array.isArray(seq) ? seq[0] : seq)?.c ?? 0);
  if (seqCount > 0) ok('fyh_org_invoice_sequences table present');
  else warn('0035 migration not applied');

  const nullOrgs = await hair.db.execute<{ c: number }>(
    sql`SELECT COUNT(*)::int AS c FROM fyh_invoices WHERE organization_id IS NULL`,
  );
  const nullCount = Number((Array.isArray(nullOrgs) ? nullOrgs[0] : nullOrgs)?.c ?? 0);
  console.log(`fyh_invoices with NULL organization_id: ${nullCount}`);
  if (nullCount > 0) warn('Run hair:saas:backfill-tenant before enabling FYH_SAAS_TENANT=1');

  await hair.close();

  if (hasPlatformDatabaseUrl()) {
    const platform = createPlatformClient({ max: 1 });
    const orgs = await platform.db.execute<{ c: number }>(
      sql`SELECT COUNT(*)::int AS c FROM platform.organizations`,
    );
    const orgCount = Number((Array.isArray(orgs) ? orgs[0] : orgs)?.c ?? 0);
    console.log(`platform.organizations: ${orgCount}`);
    if (orgCount === 0) warn('Run hair:saas:bootstrap-platform before cutover');
    else ok('Platform bootstrap org exists');
    await platform.close();
  }

  console.log('\nNo mutations performed. See docs/foryourhair/PHASE_0B_STAGING_CUTOVER.md');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

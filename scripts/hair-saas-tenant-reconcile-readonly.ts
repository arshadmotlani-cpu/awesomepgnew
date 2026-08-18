/* eslint-disable no-console */
/**
 * Read-only reconcile: Hair tenant IDs vs Platform org/locations (no fyh_tenant_mirror).
 */
import { sql } from 'drizzle-orm';
import { requireStagingEnv } from '@/src/lib/db/loadStagingEnv';

requireStagingEnv();

import { createHairClient } from '@/src/hair/db/client';
import { createPlatformClient } from '@/src/platform/db/client';
import { hasPlatformDatabaseUrl } from '@/src/platform/lib/db/env';

async function main() {
  const hair = createHairClient({ max: 1 });
  const orphanOrgs = await hair.db.execute<{ organization_id: string; count: string }>(
    sql.raw(`
      SELECT organization_id, COUNT(*)::text AS count
      FROM fyh_customers
      WHERE organization_id IS NOT NULL
      GROUP BY organization_id
    `),
  );
  const orgRows = Array.isArray(orphanOrgs)
    ? orphanOrgs
    : ((orphanOrgs as { rows?: Array<{ organization_id: string; count: string }> }).rows ?? []);

  console.log('Hair customer rows by organization_id:');
  for (const row of orgRows) {
    console.log(`  ${row.organization_id}: ${row.count}`);
  }

  if (hasPlatformDatabaseUrl()) {
    const platform = createPlatformClient({ max: 1 });
    const platformOrgs = await platform.db.execute<{ id: string; slug: string }>(
      sql.raw(`SELECT id, slug FROM platform.organizations`),
    );
    const pRows = Array.isArray(platformOrgs)
      ? platformOrgs
      : ((platformOrgs as { rows?: Array<{ id: string; slug: string }> }).rows ?? []);
    console.log('\nPlatform organizations:');
    for (const row of pRows) {
      console.log(`  ${row.id} (${row.slug})`);
    }
    const platformIds = new Set(pRows.map((r) => r.id));
    const orphans = orgRows.filter((r) => !platformIds.has(r.organization_id));
    if (orphans.length > 0) {
      console.error('\n✗ Orphan organization_ids in Hair (not in Platform):');
      orphans.forEach((o) => console.error(`  ${o.organization_id}: ${o.count} customers`));
      await hair.close();
      await platform.close();
      process.exit(1);
    }
    console.log('\n✓ All Hair organization_ids exist in Platform');
    await platform.close();
  } else {
    console.log('\nPLATFORM_DATABASE_URL not set — Hair-only reconcile');
  }

  await hair.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env npx tsx
import { loadAppEnv } from '@/src/lib/db/loadEnv';

loadAppEnv();

async function main() {
  const { listPublicPgs } = await import('@/src/db/queries/customer');
  const { getPgAvailabilitySummary } = await import('@/src/services/availabilityService');
  const { db } = await import('@/src/db/client');
  const { pgs } = await import('@/src/db/schema');
  const { ilike, isNull, and, eq } = await import('drizzle-orm');

  const publicList = await listPublicPgs();
  if (!publicList.ok) {
    console.error('listPublicPgs failed:', publicList.error);
    process.exit(1);
  }

  console.log('=== Public PG list (SSOT) ===');
  for (const pg of publicList.data) {
    const direct = await getPgAvailabilitySummary(pg.id);
    const match =
      direct.availableBeds === pg.availableBeds &&
      direct.occupiedBeds === pg.occupiedBeds;
    console.log(
      `${match ? 'OK' : 'MISMATCH'} ${pg.name}: ${pg.availableBeds}/${pg.totalBeds} avail, ${pg.occupiedBeds} occ, ${pg.maintenanceBeds} maint`,
    );
  }

  const [central] = await db
    .select({ id: pgs.id, name: pgs.name, slug: pgs.slug })
    .from(pgs)
    .where(and(ilike(pgs.name, '%central avenue%male%'), isNull(pgs.archivedAt)))
    .limit(1);

  if (central) {
    const summary = await getPgAvailabilitySummary(central.id);
    console.log('\n=== Central Avenue detail ===');
    console.log(JSON.stringify(summary, null, 2));
  }

  await (await import('@/src/db/client')).closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

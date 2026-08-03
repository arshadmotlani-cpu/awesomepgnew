/**
 * Sync FYH production service catalogue from official allowlist.
 * Usage: npx tsx scripts/sync-official-service-catalog.ts
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { eq, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhServices } from '@/src/hair/db/schema';
import { OFFICIAL_SERVICE_CATALOG } from '@/src/hair/data/officialServiceCatalog';
import {
  isOfficialCatalogName,
  isTestServiceCode,
  isTestServiceName,
} from '@/src/hair/lib/serviceCatalogHygiene';
import { isRcFixtureServiceCode } from '@/src/hair/db/rcServiceFixtures';
import { canonicalServiceName, normalizeServiceName } from '@/src/hair/lib/serviceName';

const SALON_GST_BPS = 1800;

async function nextServiceCode(): Promise<string> {
  const result = await hairDb.execute(sql`SELECT nextval('fyh_service_code_seq')::text AS n`);
  const row = (result as unknown as Array<{ n: string }>)[0];
  const n = Number(row?.n ?? 1);
  return `SVC-${String(n).padStart(4, '0')}`;
}

async function main() {
  const existing = await hairDb.select().from(fyhServices);
  const byNorm = new Map(existing.map((s) => [normalizeServiceName(s.name), s]));

  let archivedTest = 0;
  let archivedStray = 0;
  let updated = 0;
  let created = 0;

  for (const svc of existing) {
    if (isRcFixtureServiceCode(svc.code)) continue;
    const test = isTestServiceName(svc.name) || isTestServiceCode(svc.code);
    const official = isOfficialCatalogName(svc.name);
    if ((test || !official) && svc.isActive) {
      await hairDb
        .update(fyhServices)
        .set({ isActive: false, archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(fyhServices.id, svc.id));
      if (test) archivedTest++;
      else archivedStray++;
    }
  }

  for (const entry of OFFICIAL_SERVICE_CATALOG) {
    const name = canonicalServiceName(entry.name);
    const norm = normalizeServiceName(name);
    const row = byNorm.get(norm);
    const pricePaise = Math.round(entry.priceRupees * 100);

    if (row) {
      await hairDb
        .update(fyhServices)
        .set({
          name,
          category: entry.category,
          durationMinutes: entry.durationMinutes,
          pricePaise,
          gstBps: SALON_GST_BPS,
          availableOnline: entry.availableOnline,
          isActive: true,
          archivedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(fyhServices.id, row.id));
      updated++;
      continue;
    }

    const code = await nextServiceCode();
    const [inserted] = await hairDb
      .insert(fyhServices)
      .values({
        name,
        code,
        category: entry.category,
        durationMinutes: entry.durationMinutes,
        pricePaise,
        gstBps: SALON_GST_BPS,
        availableOnline: entry.availableOnline,
        isActive: true,
      })
      .returning();
    if (inserted) {
      byNorm.set(norm, inserted);
      created++;
    }
  }

  console.log(
    JSON.stringify(
      {
        catalogEntries: OFFICIAL_SERVICE_CATALOG.length,
        archivedTest,
        archivedStray,
        updated,
        created,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Remap polluted invoice line snapshots to official catalogue names.
 * Usage: npx tsx scripts/backfill-invoice-service-names.ts
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { eq, inArray } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhInvoiceLines, fyhServices } from '@/src/hair/db/schema';
import {
  findClosestOfficialService,
  isTestServiceName,
  stripTestNoise,
} from '@/src/hair/lib/serviceCatalogHygiene';
import { normalizeServiceName } from '@/src/hair/lib/serviceName';

async function main() {
  const lines = await hairDb
    .select({
      id: fyhInvoiceLines.id,
      nameSnapshot: fyhInvoiceLines.nameSnapshot,
      serviceId: fyhInvoiceLines.serviceId,
      kind: fyhInvoiceLines.kind,
    })
    .from(fyhInvoiceLines);

  const serviceIds = [...new Set(lines.map((l) => l.serviceId).filter(Boolean))] as string[];
  const services =
    serviceIds.length > 0
      ? await hairDb
          .select({ id: fyhServices.id, name: fyhServices.name, isActive: fyhServices.isActive })
          .from(fyhServices)
          .where(inArray(fyhServices.id, serviceIds))
      : [];
  const serviceById = new Map(services.map((s) => [s.id, s]));

  let updated = 0;
  for (const line of lines) {
    const linked = line.serviceId ? serviceById.get(line.serviceId) : null;
    const polluted =
      isTestServiceName(line.nameSnapshot) ||
      isTestServiceName(stripTestNoise(line.nameSnapshot)) ||
      (linked && (isTestServiceName(linked.name) || !linked.isActive));

    if (!polluted) continue;

    const match = findClosestOfficialService(line.nameSnapshot);
    if (!match) continue;

    const officialNorm = normalizeServiceName(match.entry.name);
    const [officialRow] = await hairDb
      .select({ id: fyhServices.id })
      .from(fyhServices)
      .where(eq(fyhServices.name, match.entry.name))
      .limit(1);

    await hairDb
      .update(fyhInvoiceLines)
      .set({
        nameSnapshot: match.entry.name,
        serviceId: officialRow?.id ?? null,
        kind: officialRow ? 'service' : 'custom',
      })
      .where(eq(fyhInvoiceLines.id, line.id));

    if (normalizeServiceName(line.nameSnapshot) !== officialNorm) updated++;
  }

  console.log(JSON.stringify({ scanned: lines.length, updated }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/* eslint-disable no-console */
/**
 * Verify Electricity Due queue rows have financial invoice links (WhatsApp + Open bills).
 */
import { readFileSync } from 'node:fs';
import { ilike } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { customers } from '../src/db/schema';
import { listAdminElectricityInvoicesForReminders } from '../src/db/queries/admin';
import {
  attachFinancialInvoiceIdsToCollectionQueue,
  buildCollectionsQueue,
} from '../src/lib/billing/collectionsQueue';
import { resolveFinancialInvoiceIdMap } from '../src/services/adminCashSettlement';

function loadDatabaseUrl(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  for (const path of ['.env.prod.live', '.env.bak', '.env.off', '.env.local']) {
    try {
      const raw = readFileSync(path, 'utf8');
      const match = raw.match(/^DATABASE_URL=(.+)$/m);
      const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
      if (value) {
        process.env.DATABASE_URL = value;
        console.log(`Using DATABASE_URL from ${path}`);
        return;
      }
    } catch {
      // next
    }
  }
}

async function main() {
  loadDatabaseUrl();
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const elec = await listAdminElectricityInvoicesForReminders();
  const rows = elec.ok ? elec.data : [];
  const raw = buildCollectionsQueue({ rentRows: [], electricityRows: rows });
  const map = await resolveFinancialInvoiceIdMap(
    raw.map((i) => ({ sourceTable: i.sourceTable, sourceId: i.sourceId })),
  );
  const missingBefore = raw.filter((i) => !map.get(`${i.sourceTable}:${i.sourceId}`));
  const enriched = await attachFinancialInvoiceIdsToCollectionQueue(raw);

  console.log('\n=== Electricity Due financial invoice audit ===');
  console.log('Queue rows (raw):', raw.length);
  console.log('Missing financial invoice before attach:', missingBefore.length);
  console.log('After attach (WhatsApp-safe):', enriched.length);
  console.log('Orphans dropped:', raw.length - enriched.length);

  if (missingBefore.length > 0) {
    console.log('\nSynced missing mirrors for:');
    for (const m of missingBefore.slice(0, 20)) {
      const after = enriched.find((e) => e.sourceId === m.sourceId);
      console.log(
        `- ${m.customerFullName} | elec ${m.sourceId} → fin ${after?.financialInvoiceId ?? 'STILL MISSING'}`,
      );
    }
  }

  const syedRows = await db
    .select({ id: customers.id, fullName: customers.fullName })
    .from(customers)
    .where(ilike(customers.fullName, '%Syed%Ahmed%'));

  console.log('\n=== Syed Ahmed ===');
  for (const s of syedRows) {
    const inQueue = enriched.filter((e) => e.customerId === s.id);
    console.log({
      customerId: s.id,
      name: s.fullName,
      queueRows: inQueue.map((q) => ({
        invoice: q.invoiceNumber,
        financialInvoiceId: q.financialInvoiceId,
        openHref: q.financialInvoiceId ? `/admin/invoices/${q.financialInvoiceId}` : null,
      })),
    });
  }

  const orphans = enriched.filter((e) => !e.financialInvoiceId);
  if (orphans.length > 0) {
    console.error('\nFAIL: enriched rows still missing financialInvoiceId:', orphans.length);
    process.exit(1);
  }

  console.log('\nPASS: all electricity due queue rows have financial invoice links.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closeDb());

/* eslint-disable no-console */
/**
 * End-to-end electricity module certification.
 *
 *   npx tsx scripts/electricity-module-certification.ts
 *   npx tsx scripts/electricity-module-certification.ts --month 2026-06-01
 */
import 'dotenv/config';

import { closeDb } from '../src/db/client';
import { hasDatabaseUrl } from '../src/lib/db/env';
import { countActiveElectricityInvoiceDuplicates } from '../src/services/electricityInvoiceDuplicates';
import { loadElectricityRoomDashboard } from '../src/services/electricityRoomDashboard';
import { firstOfMonth } from '../src/services/billing';

type Check = { name: string; pass: boolean; detail: string };

async function main() {
  if (!hasDatabaseUrl()) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }

  const monthIdx = process.argv.indexOf('--month');
  const billingMonth = monthIdx >= 0 ? firstOfMonth(process.argv[monthIdx + 1]!) : firstOfMonth(new Date());

  const checks: Check[] = [];

  const dupes = await countActiveElectricityInvoiceDuplicates();
  checks.push({
    name: 'Duplicate Protection',
    pass: dupes === 0,
    detail: dupes === 0 ? 'No duplicate invoice groups' : `${dupes} duplicate group(s) — repair at /admin/electricity/duplicates`,
  });

  const dashboard = await loadElectricityRoomDashboard({ billingMonth });
  checks.push({
    name: 'Room Dashboard',
    pass: true,
    detail: `${dashboard.roomCount} room(s) · ${dashboard.roomsFullyCollected} fully collected · ${dashboard.roomsWithWarnings} warning(s)`,
  });

  const unbalanced = dashboard.rows.filter((r) => !r.isBalanced);
  checks.push({
    name: 'Room Reconciliation',
    pass: unbalanced.length === 0,
    detail:
      unbalanced.length === 0
        ? 'All rooms balanced'
        : `${unbalanced.length} unbalanced: ${unbalanced.map((r) => r.roomNumber).join(', ')}`,
  });

  const overCollected = dashboard.rows.filter((r) => r.overCollectionPaise > 0);
  checks.push({
    name: 'Over-collection Guard',
    pass: overCollected.length === 0,
    detail:
      overCollected.length === 0
        ? 'No over-collection'
        : `${overCollected.length} room(s) over-collected`,
  });

  checks.push({
    name: 'Ledger SSOT',
    pass: dashboard.rows.every((r) => r.validation.isValid || r.outstandingPaise === 0),
    detail: 'Room ledger drives collected + outstanding per room',
  });

  console.log('\nElectricity Module Certification');
  console.log(`Billing month: ${billingMonth}`);
  console.log('─'.repeat(60));

  let allPass = true;
  for (const c of checks) {
    const icon = c.pass ? '✓' : '✗';
    console.log(`${icon} ${c.name}`);
    console.log(`  ${c.detail}`);
    if (!c.pass) allPass = false;
  }

  console.log('─'.repeat(60));
  console.log(allPass ? '✓ ALL CHECKS PASSED' : '✗ SOME CHECKS FAILED');
  process.exit(allPass ? 0 : 1);
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb().catch(() => undefined);
    process.exit(1);
  });

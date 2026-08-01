#!/usr/bin/env npx tsx
/**
 * Reconcile room type capacity / sharing labels with active bed inventory.
 *
 *   npx tsx scripts/reconcile-room-inventory-mismatches.ts
 *   npx tsx scripts/reconcile-room-inventory-mismatches.ts --execute
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
import { closeDb } from '@/src/db/client';
import { getDatabaseConnectionInfo } from '@/src/lib/db/env';
import { reconcileAllMismatchedRooms } from '@/src/services/reconcileRoomInventory';
import { getAllPgsRoomIntegrityReport } from '@/src/services/roomIntegrityValidator';

loadProductionAuditEnv();
requireDatabaseUrl('reconcile-room-inventory-mismatches.ts');

async function main() {
  const dryRun = !process.argv.includes('--execute');
  const conn = getDatabaseConnectionInfo();

  console.log('═'.repeat(80));
  console.log(`ROOM INVENTORY RECONCILIATION (${dryRun ? 'DRY RUN' : 'EXECUTE'})`);
  console.log('═'.repeat(80));
  console.log(`DB: ${conn.host ?? 'unknown'}`);
  console.log(`Generated: ${new Date().toISOString()}\n`);

  const before = await getAllPgsRoomIntegrityReport();
  console.log(`Before: ${before.totalRoomsWithIssues}/${before.totalRooms} rooms with mismatches\n`);

  if (before.totalRoomsWithIssues === 0) {
    console.log('All rooms already pass integrity checks.');
    await closeDb();
    return;
  }

  for (const pg of before.reports) {
    for (const room of pg.rooms.filter((r) => r.hasMismatch)) {
      console.log(
        `${pg.pgName} · Room ${room.roomNumber} · ${room.roomTypeName} · cap ${room.storedCapacity} · phys ${room.physicalBeds}`,
      );
      for (const issue of room.issues) {
        console.log(`  • ${issue.message}`);
      }
    }
  }
  console.log('');

  if (dryRun) {
    console.log('Dry run — pass --execute to apply reconciliation.');
    await closeDb();
    return;
  }

  const report = await reconcileAllMismatchedRooms();

  console.log('─'.repeat(80));
  console.log(`Fixed: ${report.fixed}/${report.mismatched} mismatched rooms`);
  console.log(`Still broken: ${report.stillBroken}\n`);

  for (const result of report.results) {
    const after = result.after;
    const status = result.fixed ? 'FIXED' : result.error ? 'ERROR' : 'UNCHANGED';
    console.log(
      `[${status}] ${result.pgName} · Room ${result.roomNumber} · ${after?.roomTypeName ?? '?'} · cap ${after?.storedCapacity ?? '?'} · phys ${after?.physicalBeds ?? '?'}`,
    );
    if (result.error) console.log(`  Error: ${result.error}`);
    if (after?.hasMismatch) {
      for (const issue of after.issues) console.log(`  • ${issue.message}`);
    }
  }

  const afterAudit = await getAllPgsRoomIntegrityReport();
  console.log('\n─'.repeat(80));
  console.log(
    `After audit: ${afterAudit.totalRoomsWithIssues}/${afterAudit.totalRooms} rooms with mismatches`,
  );

  if (afterAudit.totalRoomsWithIssues === 0) {
    console.log('All rooms pass integrity checks.');
  }

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});

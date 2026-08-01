#!/usr/bin/env npx tsx
/**
 * Read-only room integrity audit — every PG, every room.
 *
 *   npx tsx scripts/audit-room-inventory-readonly.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
import { closeDb } from '@/src/db/client';
import { getDatabaseConnectionInfo } from '@/src/lib/db/env';
import { getAllPgsRoomIntegrityReport } from '@/src/services/roomIntegrityValidator';

loadProductionAuditEnv();
requireDatabaseUrl('audit-room-inventory-readonly.ts');

async function main() {
  const conn = getDatabaseConnectionInfo();
  console.log('═'.repeat(80));
  console.log('ROOM INTEGRITY AUDIT (read-only)');
  console.log('═'.repeat(80));
  console.log(`DB: ${conn.host ?? 'unknown'}`);
  console.log(`Generated: ${new Date().toISOString()}\n`);

  const report = await getAllPgsRoomIntegrityReport();

  console.log(`PGs scanned: ${report.pgsScanned}`);
  console.log(`Rooms scanned: ${report.totalRooms}`);
  console.log(`Rooms with mismatches: ${report.totalRoomsWithIssues}\n`);

  if (report.totalRoomsWithIssues === 0) {
    console.log('All rooms pass integrity checks.');
    await closeDb();
    return;
  }

  for (const pg of report.reports) {
    if (pg.roomsWithIssues === 0) continue;

    console.log('─'.repeat(80));
    console.log(`${pg.pgName} (${pg.roomsWithIssues}/${pg.roomsScanned} rooms with issues)`);
    console.log('─'.repeat(80));

    for (const room of pg.rooms.filter((r) => r.hasMismatch)) {
      console.log(`\nRoom ${room.roomNumber} · ${room.roomTypeName}`);
      console.log(
        `  Capacity ${room.storedCapacity} · Physical ${room.physicalBeds} · Bookable ${room.bookableBeds} · Occupied ${room.occupiedBeds}`,
      );
      if (room.blockedBeds + room.maintenanceBeds > 0) {
        console.log(
          `  Blocked ${room.blockedBeds} · Maintenance ${room.maintenanceBeds}`,
        );
      }
      for (const issue of room.issues) {
        console.log(`  • ${issue.message}`);
      }
    }
    console.log('');
  }

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});

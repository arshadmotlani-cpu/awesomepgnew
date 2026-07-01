#!/usr/bin/env npx tsx
/**
 * Convert Shantinagar Room 201 to permanent single sharing (like Room 101).
 *
 *   npx tsx scripts/convert-room-201-single-sharing.ts --dry-run
 *   npx tsx scripts/convert-room-201-single-sharing.ts --execute
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { closeDb } from '@/src/db/client';
import type { AdminSession } from '@/src/lib/auth/session';
import { paiseToInr } from '@/src/lib/format';
import { convertRoom201ToSingleSharing } from '@/src/services/room201SingleSharingConversion';
import { runGhostBookingAudit } from '@/src/services/ghostBookingAudit';
import { runBedAudit } from '@/src/services/bedAudit';
import { listStaleBillingProfilesForPg } from '@/src/lib/billing/rentPricingSsot';
import { JULY_BILLING_MONTH } from '@/src/services/shantinagarJulyRentProduction';

function bootstrapSession(): AdminSession {
  return {
    kind: 'admin',
    sessionId: 'room-201-conversion',
    adminId: '00000000-0000-4000-8000-000000000001',
    email: 'script@awesomepg.internal',
    fullName: 'Room 201 conversion',
    role: 'super_admin',
    pgScope: [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 3600_000),
  };
}

async function main() {
  const dryRun = !process.argv.includes('--execute');
  const session = bootstrapSession();

  console.log(`\n=== Room 201 → Single Sharing (${dryRun ? 'DRY RUN' : 'EXECUTE'}) ===\n`);

  const report = await convertRoom201ToSingleSharing({ session, dryRun });

  for (const action of report.actions) {
    console.log(`  • ${action}`);
  }

  console.log('\n--- Verification ---');
  console.log(`Room 201 capacity: ${report.room201.capacityBefore} → ${report.room201.capacityAfter}`);
  console.log(`Remaining bed: ${report.room201.remainingBedCode} (${report.room201.remainingBedId})`);
  if (report.room201.removedBedId) {
    console.log(`Removed bed: ${report.room201.removedBedCode} (${report.room201.removedBedId})`);
  }
  console.log(
    `Monthly rent: ${paiseToInr(report.room201.monthlyRentPaise)} · Deposit: ${paiseToInr(report.room201.depositPaise)}`,
  );
  console.log(
    `Billing mode: ${report.room201.billingModeBefore} → ${report.room201.billingModeAfter}`,
  );

  if (report.resident) {
    console.log(
      `Resident: ${report.resident.name} (${report.resident.bookingCode}) · bed ${report.resident.bedBefore} → ${report.resident.bedAfter}`,
    );
  }

  console.log(
    `Occupancy: ${report.occupancy.occupiedBefore}/${report.occupancy.totalBedsBefore} (${report.occupancy.percentBefore}%) → ${report.occupancy.occupiedAfter}/${report.occupancy.totalBedsAfter} (${report.occupancy.percentAfter}%)`,
  );

  if (!dryRun) {
    const stale = await listStaleBillingProfilesForPg(report.pgId, JULY_BILLING_MONTH);
    console.log(`Stale billing profiles: ${stale.length}`);
    if (stale.length > 0) {
      for (const row of stale) {
        console.log(
          `  - ${row.customerName} (${row.roomNumber}): profile ${paiseToInr(row.profileRentPaise)} vs expected ${paiseToInr(row.expectedRentPaise)}`,
        );
      }
    }

    const bedAudit = await runBedAudit();
    const ghost = await runGhostBookingAudit(bedAudit.issues.length);
    console.log(`Bed audit issues: ${bedAudit.issues.length}`);
    console.log(`Ghost booking issues: ${ghost.summary.totalIssues}`);
  }

  if (report.issues.length > 0) {
    console.log('\nIssues:');
    for (const issue of report.issues) {
      console.log(`  ✗ ${issue}`);
    }
  }

  console.log(report.pass ? '\n✓ Room 201 conversion complete' : '\n✗ Conversion completed with issues');
  await closeDb();
  process.exit(report.pass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});

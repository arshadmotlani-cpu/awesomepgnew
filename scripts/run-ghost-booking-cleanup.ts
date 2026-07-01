#!/usr/bin/env npx tsx
/**
 * Ghost booking cleanup — occupancy placeholders, bed audit repair, occupancy rebuild.
 *
 *   npx tsx scripts/run-ghost-booking-cleanup.ts
 *   npx tsx scripts/run-ghost-booking-cleanup.ts --dry-run
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { closeDb } from '@/src/db/client';
import type { AdminSession } from '@/src/lib/auth/session';
import { repairBedAuditIssue, runBedAudit } from '@/src/services/bedAudit';
import { rebuildOccupancyState } from '@/src/services/occupancyDiagnostics';
import { runGhostBookingAudit } from '@/src/services/ghostBookingAudit';
import { purgeOccupancyPlaceholderFromSystem } from '@/src/services/occupancyAdmin';

function bootstrapSession(): AdminSession {
  return {
    kind: 'admin',
    sessionId: 'ghost-booking-cleanup',
    adminId: '00000000-0000-4000-8000-000000000001',
    email: 'script@awesomepg.internal',
    fullName: 'Ghost booking cleanup',
    role: 'super_admin',
    pgScope: [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 3600_000),
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(`\n=== Ghost booking cleanup (${dryRun ? 'DRY RUN' : 'EXECUTE'}) ===\n`);

  const bedBefore = await runBedAudit();
  console.log(`Bed audit before: ${bedBefore.issues.length} issue(s)`);
  for (const issue of bedBefore.issues) {
    console.log(`  [${issue.kind}] ${issue.detail}`);
  }

  const ghostBefore = await runGhostBookingAudit(bedBefore.issues.length);
  console.log(`\nGhost audit before: ${ghostBefore.summary.totalIssues} issue(s)`);
  console.log(
    `  assigned_no_invoice=${ghostBefore.summary.assignedNoInvoice} · invoice_no_booking=${ghostBefore.summary.invoiceNoBooking} · booking_no_invoice=${ghostBefore.summary.bookingNoInvoice} · occupied_no_active_booking=${ghostBefore.summary.occupiedNoActiveBooking}`,
  );
  for (const issue of ghostBefore.ghostIssues.slice(0, 15)) {
    console.log(`  [${issue.kind}] ${issue.detail}`);
  }
  if (ghostBefore.ghostIssues.length > 15) {
    console.log(`  … and ${ghostBefore.ghostIssues.length - 15} more`);
  }

  if (!dryRun) {
    console.log('\n--- Purge occupancy placeholders ---');
    const purge = await purgeOccupancyPlaceholderFromSystem(bootstrapSession());
    console.log(
      `  beds released: ${purge.bedsReleased} · bookings cancelled: ${purge.bookingsCancelled} · customer archived: ${purge.customerArchived}`,
    );

    console.log('\n--- Bed repairs ---');
    for (const issue of bedBefore.issues) {
      const result = await repairBedAuditIssue(issue);
      console.log(`  [${issue.kind}] ${result.ok ? 'OK' : 'SKIP'}: ${result.message}`);
    }

    console.log('\n--- Occupancy rebuild ---');
    const rebuild = await rebuildOccupancyState();
    console.log(
      `  orphan reservations closed: ${rebuild.orphanReservationsClosed} · bookings reconciled: ${rebuild.bookingsReconciled} · residency synced: ${rebuild.residencyStatusSynced} · demoted: ${rebuild.residencyStatusDemoted}`,
    );
  }

  const bedAfter = await runBedAudit();
  const ghostAfter = await runGhostBookingAudit(bedAfter.issues.length);

  console.log(`\n=== After ===`);
  console.log(`Bed audit: ${bedAfter.issues.length} issue(s)`);
  console.log(`Ghost audit: ${ghostAfter.summary.totalIssues} issue(s)`);
  if (ghostAfter.ghostIssues.length > 0) {
    for (const issue of ghostAfter.ghostIssues) {
      console.log(`  [${issue.kind}] ${issue.detail}`);
    }
  }
  console.log(
    ghostAfter.summary.totalIssues === 0
      ? '\n✓ Ghost booking cleanup complete'
      : '\n✗ Remaining issues require manual review',
  );

  await closeDb();
  process.exit(ghostAfter.summary.totalIssues === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});

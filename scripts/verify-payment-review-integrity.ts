#!/usr/bin/env npx tsx
/**
 * P0 payment review SSOT verification — queue, dashboard, badge, unresolved must match.
 *
 *   npx tsx scripts/verify-payment-review-integrity.ts
 *   npx tsx scripts/verify-payment-review-integrity.ts --fix
 */
import { loadScriptEnv } from '../src/lib/scripts/loadScriptEnv';
import { createClient } from '../src/db/client';
import { syncActionItemsForCron } from '../src/services/actionItems';
import { syncUnresolvedActionsFromDomain } from '../src/services/unresolvedActionSync';
import {
  getPaymentReviewIntegrityReport,
  resolveStalePaymentReviewArtifacts,
} from '../src/services/paymentReviewIntegrity';
import type { AdminSession } from '../src/lib/auth/session';

loadScriptEnv();

const FIX = process.argv.includes('--fix');

const CRON_SESSION: AdminSession = {
  kind: 'admin',
  sessionId: 'verify-payment-review',
  adminId: 'verify-payment-review',
  email: 'verify@system',
  fullName: 'Verify Payment Review',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

function printAuditTable(
  rows: Awaited<ReturnType<typeof getPaymentReviewIntegrityReport>>['auditTable'],
) {
  console.log('\nAudit table (SSOT surfaces):');
  console.log('─'.repeat(90));
  console.log(
    `${'Surface'.padEnd(42)} ${'Service'.padEnd(28)} Count`,
  );
  console.log('─'.repeat(90));
  for (const row of rows) {
    console.log(
      `${row.surface.padEnd(42)} ${row.service.padEnd(28)} ${row.count}`,
    );
    console.log(`  query: ${row.query}`);
  }
}

function printStale(stale: Awaited<ReturnType<typeof getPaymentReviewIntegrityReport>>['stale']) {
  console.log('\nStale row audit (not in payment review queue):');
  console.log('─'.repeat(60));

  const sections: Array<[string, string[]]> = [
    ['bookings.status=pending_payment (old Overview KPI source)', stale.pendingPaymentBookings],
    ['action_items payment_received (orphan)', stale.openPaymentReceivedActionItems],
    ['unresolved_actions payment_proof_review (orphan)', stale.orphanPaymentProofUnresolved],
    ['admin_notifications payment_received (no open task)', stale.stalePaymentNotifications],
  ];

  for (const [label, ids] of sections) {
    console.log(`\n${label}: ${ids.length}`);
    for (const id of ids) console.log(`  ${id}`);
    if (ids.length === 0) console.log('  (none)');
  }
}

async function main() {
  const { close } = createClient();

  try {
    console.log('═'.repeat(60));
    console.log('P0 PAYMENT REVIEW INTEGRITY VERIFICATION');
    console.log('═'.repeat(60));

    if (FIX) {
      console.log('\nRunning sync + stale cleanup…');
      await syncActionItemsForCron();
      await syncUnresolvedActionsFromDomain(CRON_SESSION);
      const cleanup = await resolveStalePaymentReviewArtifacts(CRON_SESSION);
      console.log(
        `  resolved action_items: ${cleanup.resolvedActionItems}, closed unresolved: ${cleanup.closedUnresolved}, archived notifications: ${cleanup.archivedNotifications}`,
      );
    }

    const report = await getPaymentReviewIntegrityReport(CRON_SESSION);

    console.log('\nCounts (must all match):');
    console.log(`  Queue count:                        ${report.queueCount}`);
    console.log(`  Dashboard count:                    ${report.dashboardCount}`);
    console.log(`  Badge count (payments):               ${report.badgeCount}`);
    console.log(`  Open unresolved (payment_proof_review): ${report.openUnresolvedPaymentReviewCount}`);

    printAuditTable(report.auditTable);
    printStale(report.stale);

    if (!report.matches) {
      console.log('\nOVERALL: FAIL — SSOT mismatch');
      console.log('Re-run with --fix after deploy, or investigate stale rows above.');
      process.exitCode = 1;
      return;
    }

    console.log('\nOVERALL: PASS');
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

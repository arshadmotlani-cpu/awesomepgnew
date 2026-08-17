/**
 * Read-only: print failing billing reconciliation checks for current month.
 * npx tsx scripts/audit-reconciliation-checks.ts
 */
import type { AdminSession } from '../src/lib/auth/session';
import { loadBillingReconciliationSafe } from '../src/services/billingCycleReconciliation';

function superAdminSession(): AdminSession {
  return {
    kind: 'admin',
    sessionId: 'audit-script',
    adminId: 'audit-script',
    email: 'audit@local',
    fullName: 'Audit Script',
    role: 'super_admin',
    pgScope: [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}

async function main() {
  const session = superAdminSession();
  const r = await loadBillingReconciliationSafe(session);
  if (!r.ok) {
    console.error('ERROR:', r.error);
    process.exit(1);
  }
  const rec = r.reconciliation;
  console.log('Billing month:', rec.billingMonth);
  console.log('Headline:', rec.headline);
  console.log('Status:', rec.status);
  console.log('Actionable:', rec.actionableHeadline, `(${rec.actionableIssueCount})`);
  console.log('\nFailed checks:');
  for (const c of rec.checks.filter((x) => !x.pass)) {
    console.log(`  [${c.id}] ${c.label}: ${c.detail}`);
  }
  console.log('\nPassed checks:', rec.checks.filter((x) => x.pass).map((x) => x.id).join(', '));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

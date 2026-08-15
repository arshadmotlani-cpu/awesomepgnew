#!/usr/bin/env npx tsx
/**
 * Fast production migration — executes bulk migrate only, then prints summary.
 *   USE_PRODUCTION_DB=1 npx tsx scripts/execute-billing-cycle-migration-production-fast.ts --execute
 */
import { eq } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('execute-billing-cycle-migration-production-fast.ts');

import { closeDb, db } from '../src/db/client';
import { adminUsers } from '../src/db/schema/adminUsers';
import { executeBulkBillingCycleMigration } from '../src/services/billingCycleMigration';

const execute = process.argv.includes('--execute');

async function main() {
  const [admin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.role, 'super_admin'))
    .limit(1);
  if (!admin) throw new Error('No super_admin');

  const session = {
    adminId: admin.id,
    role: 'super_admin' as const,
    pgScope: null,
    email: admin.email,
  };

  console.log(execute ? 'EXECUTING migration...' : 'DRY RUN...');
  const results = await executeBulkBillingCycleMigration(session, {
    dryRun: !execute,
    note: 'Automated production billing cycle migration to calendar_month_1st.',
  });

  for (const r of results) {
    console.log(
      JSON.stringify({
        code: r.bookingCode,
        name: r.customerName,
        action: r.action,
        detail: r.detail,
        transitionInvoiceId: r.transitionInvoiceId,
        uncoveredMonthInvoiceId: r.uncoveredMonthInvoiceId,
      }),
    );
  }

  const counts = {
    policy_flip: results.filter((r) => r.action === 'policy_flip').length,
    financial_transition: results.filter((r) => r.action === 'financial_transition').length,
    skipped: results.filter((r) => r.action === 'skipped').length,
    blocked: results.filter((r) => r.action === 'blocked').length,
    error: results.filter((r) => r.action === 'error').length,
  };
  console.log('SUMMARY', JSON.stringify(counts));
}

main()
  .then(() => closeDb())
  .catch((e) => {
    console.error(e);
    closeDb().finally(() => process.exit(1));
  });

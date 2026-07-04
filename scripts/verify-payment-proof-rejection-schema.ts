#!/usr/bin/env npx tsx
/**
 * Post-migrate verification for payment proof rejection schema (0099 + 0100_*).
 *
 * Local:
 *   npx tsx scripts/verify-payment-proof-rejection-schema.ts
 *
 * Production DB (requires Neon DATABASE_URL in .env.local — integration secrets
 * are not exported by `vercel env pull`):
 *   npx tsx scripts/verify-payment-proof-rejection-schema.ts
 *
 * Production runtime (uses server DATABASE_URL + CRON_SECRET):
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://www.awesomepg.in/api/cron/payment-proof-rejection-verify
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';

loadAppEnv();

import { createClient } from '@/src/db/client';
import { getDatabaseConnectionInfo } from '@/src/lib/db/env';
import {
  runPaymentProofRejectionSchemaChecks,
  summarizePaymentProofSchemaChecks,
} from '@/src/lib/db/paymentProofRejectionSchemaVerify';

async function main() {
  const connection = getDatabaseConnectionInfo();
  console.log('═'.repeat(72));
  console.log('PAYMENT PROOF REJECTION SCHEMA VERIFICATION');
  console.log('═'.repeat(72));
  console.log(`Database: ${connection.label} (${connection.host})`);
  console.log('');

  const { db, close } = createClient({ max: 1 });

  try {
    const checks = await runPaymentProofRejectionSchemaChecks(db);
    for (const c of checks) {
      const mark = c.pass ? 'PASS' : 'FAIL';
      console.log(`[${mark}] ${c.label}`);
      console.log(`       ${c.detail}`);
    }

    const summary = summarizePaymentProofSchemaChecks(checks);
    console.log('');
    console.log('─'.repeat(72));
    console.log(`Summary: ${summary.passed}/${summary.total} checks passed`);
    if (!summary.ok) {
      console.error('\n✗ SCHEMA VERIFICATION FAILED');
      for (const f of summary.failed) {
        console.error(`  - ${f.label}: ${f.detail}`);
      }
      process.exit(1);
    }
    console.log('✓ All payment proof rejection schema checks passed');
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error('✗ Verification script error:', err);
  process.exit(1);
});

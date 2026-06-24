#!/usr/bin/env npx tsx
/**
 * P0 financial chain verification — APG-2026-0035 / APG-2026-0036
 *
 *   npx tsx scripts/verify-financial-chain-0035-0036.ts
 *   npx tsx scripts/verify-financial-chain-0035-0036.ts --execute
 *
 * Vercel: VERIFY_FINANCIAL_CHAIN_0035_0036=1
 */
import { createClient } from '../src/db/client';
import { loadScriptEnv } from '../src/lib/scripts/loadScriptEnv';
import { paiseToInr } from '../src/lib/format';
import {
  FINANCIAL_CHAIN_BOOKING_CODES,
  runFinancialChainVerification,
} from '../src/services/financialChainVerification';

loadScriptEnv();

async function main() {
  const execute = process.argv.includes('--execute');
  const { close } = createClient();

  try {
    console.log('═'.repeat(72));
    console.log('P0 FINANCIAL CHAIN VERIFICATION');
    console.log(`Bookings: ${FINANCIAL_CHAIN_BOOKING_CODES.join(', ')}`);
    console.log(`Mode: ${execute ? 'VERIFY + REPAIR' : 'VERIFY ONLY'}`);
    console.log('═'.repeat(72));

    const report = await runFinancialChainVerification({
      bookingCodes: [...FINANCIAL_CHAIN_BOOKING_CODES],
      execute,
    });

    for (const b of report.bookings) {
      console.log(`\n## ${b.bookingCode} (${b.residentLabel})`);
      console.log(`Payment date: ${b.paymentDate?.slice(0, 10) ?? '—'}`);
      console.log(`Expected rent: ${paiseToInr(b.expectedRentPaise)}`);
      console.log(`Deposit held: ${paiseToInr(b.depositHeldPaise)}`);
      console.log('\nIDs:');
      console.log(JSON.stringify(b.ids, null, 2));
      console.log('\nChecks:');
      for (const [k, v] of Object.entries(b.checks)) {
        console.log(`  ${v ? 'PASS' : 'FAIL'} ${k}`);
      }
      console.log(`Overall: ${b.overallPass ? 'PASS' : 'FAIL'} (${b.passCount}/10)`);
    }

    console.log('\n--- REVENUE RECONCILIATION ---');
    console.log(JSON.stringify(report.revenueReconciliation, null, 2));

    console.log('\n--- PASS / FAIL MATRIX ---');
    for (const m of report.matrix) {
      console.log(`${m.bookingCode}: ${m.overallPass ? 'PASS' : 'FAIL'}`);
      console.log(`  rent_invoice: ${m.rentInvoiceId ?? 'MISSING'}`);
      console.log(`  financial_invoice: ${m.financialInvoiceId ?? 'MISSING'}`);
    }

    if (report.repairActions.length > 0) {
      console.log('\n--- REPAIR ACTIONS ---');
      console.log(JSON.stringify(report.repairActions, null, 2));
    }

    console.log('\n--- FULL REPORT JSON ---');
    console.log(JSON.stringify(report, null, 2));
    console.log(`\nOVERALL: ${report.overallPass ? 'PASS' : 'FAIL'}`);

    if (!report.overallPass) process.exit(1);
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

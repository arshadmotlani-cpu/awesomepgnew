/**
 * Repair checkout rent proration gaps — Option A (full-month invoice correction).
 *
 * Run:
 *   npx tsx scripts/repair-checkout-rent-proration-gaps.ts --dry-run --code APG-2026-0045
 *   npx tsx scripts/repair-checkout-rent-proration-gaps.ts --execute --code APG-2026-0045
 *   npx tsx scripts/repair-checkout-rent-proration-gaps.ts --dry-run --all
 */
import { createClient } from '@/src/db/client';
import { paiseToInr } from '@/src/lib/format';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
import {
  auditCheckoutRentAccounting,
  discoverCheckoutRentProrationGaps,
  repairAllCheckoutRentAccountingGaps,
  repairCheckoutRentAccountingGap,
} from '@/src/services/checkoutRentAccounting';

loadProductionAuditEnv();
requireDatabaseUrl();

function parseCodeArg(): string | undefined {
  const eqArg = process.argv.find((a) => a.startsWith('--code='));
  if (eqArg) return eqArg.split('=')[1];
  const idx = process.argv.indexOf('--code');
  if (idx >= 0) return process.argv[idx + 1];
  return undefined;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const all = process.argv.includes('--all');
  const bookingCode = parseCodeArg();
  const { close } = createClient();

  try {
    console.log('═'.repeat(72));
    console.log(`CHECKOUT RENT ACCOUNTING REPAIR — ${execute ? 'EXECUTE' : 'DRY RUN'}`);
    console.log('═'.repeat(72));

    if (!all && !bookingCode) {
      console.error('Specify --code APG-XXXX-XXXX or --all');
      process.exit(1);
    }

    const gapsBefore = await discoverCheckoutRentProrationGaps(
      bookingCode ? { bookingCode } : undefined,
    );
    console.log(`Gaps before: ${gapsBefore.length}`);
    for (const g of gapsBefore) {
      console.log(
        `  ${g.bookingCode} | diff ${paiseToInr(g.differencePaise)} | outstanding ${paiseToInr(g.outstandingRentPaise)}`,
      );
    }
    console.log('');

    const results = all
      ? await repairAllCheckoutRentAccountingGaps({ execute })
      : [
          await repairCheckoutRentAccountingGap({
            bookingCode: bookingCode!,
            execute,
          }),
        ];

    for (const result of results) {
      console.log(`--- ${result.bookingCode} ---`);
      if (result.skipped) {
        console.log(`  SKIPPED: ${result.skipReason}`);
      }
      if (result.before) {
        console.log('  BEFORE:', JSON.stringify(result.before));
      }
      if (result.after) {
        console.log(`  AFTER (${execute ? 'applied' : 'projected'}):`, JSON.stringify(result.after));
      }
      if (result.executed) {
        const audit = await auditCheckoutRentAccounting(result.bookingCode);
        console.log(
          `  POST-REPAIR closed=${audit?.closed} rent.received=${paiseToInr(audit?.balances?.rent.receivedPaise ?? 0)} outstanding=${paiseToInr(audit?.balances?.rent.outstandingPaise ?? 0)}`,
        );
      }
      console.log('');
    }

    const gapsAfter = await discoverCheckoutRentProrationGaps(
      bookingCode ? { bookingCode } : undefined,
    );
    console.log(`Gaps after: ${gapsAfter.length}`);

    if (execute && gapsAfter.length > 0) {
      process.exit(1);
    }
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

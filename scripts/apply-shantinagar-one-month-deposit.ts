#!/usr/bin/env npx tsx
/**
 * Apply one-month deposit policy to SHANTINAGAR - AWESOME PG.
 *
 *   npx tsx scripts/apply-shantinagar-one-month-deposit.ts
 *   npx tsx scripts/apply-shantinagar-one-month-deposit.ts --execute
 *   npx tsx scripts/apply-shantinagar-one-month-deposit.ts --execute --pg-slug=shantinagar-awesome-pg
 */
import { loadScriptEnv } from '@/src/lib/scripts/loadScriptEnv';
import { ilike } from 'drizzle-orm';
import { paiseToInr } from '@/src/lib/format';

loadScriptEnv();

const SCRIPT_SESSION = {
  kind: 'admin' as const,
  sessionId: 'deposit-policy-script',
  adminId: 'deposit-policy-script',
  email: 'script@system',
  fullName: 'Deposit Policy Script',
  role: 'super_admin' as const,
  pgScope: [] as string[],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

async function main() {
  const execute = process.argv.includes('--execute');
  const pgSlugArg = process.argv.find((a) => a.startsWith('--pg-slug='))?.split('=')[1];
  const targetSlug = pgSlugArg ?? 'shantinagar-awesome-pg';

  const { db, closeDb } = await import('@/src/db/client');
  const { pgs } = await import('@/src/db/schema');
  const { applyPgOneMonthDepositPolicy } = await import('@/src/services/pgInventory');
  const {
    capturePgFinancialFingerprint,
    verifyPgFinancialFingerprintUnchanged,
    sampleResidentPricingIntegrity,
  } = await import('@/src/services/pgPricingSafetyAudit');
  const { computeMonthlyDepositPaise, computePriceBreakdown } = await import('@/src/services/pricing');
  const { displayMonthlyDepositPaise } = await import('@/src/lib/customerDepositDisplay');

  const [pg] = await db
    .select({ id: pgs.id, name: pgs.name, slug: pgs.slug })
    .from(pgs)
    .where(ilike(pgs.slug, targetSlug))
    .limit(1);

  if (!pg) {
    console.error(`PG not found for slug: ${targetSlug}`);
    process.exit(1);
  }

  const { getPgInventory } = await import('@/src/services/pgInventory');
  const inv = await getPgInventory(SCRIPT_SESSION, pg.id);
  const beds = inv.beds;

  console.log(`\n=== SHANTINAGAR deposit policy ${execute ? 'APPLY' : 'DRY RUN'} ===\n`);
  console.log(`PG: ${pg.name} (${pg.slug})`);
  console.log(`Beds: ${beds.length}`);

  const roomNumbers = [...new Set(beds.map((b) => b.roomNumber))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  console.log(`Rooms: ${roomNumbers.length} — ${roomNumbers.join(', ')}\n`);

  const mismatches: string[] = [];
  const still2x: string[] = [];

  for (const bed of beds) {
    const rent = bed.monthlyRatePaise;
    const dep = bed.monthlyDepositPaise;
    if (rent <= 0) {
      mismatches.push(`${bed.roomNumber}-${bed.bedCode}: no monthly rent`);
      continue;
    }
    if (dep === rent * 2) {
      still2x.push(`${bed.roomNumber}-${bed.bedCode}: deposit ${paiseToInr(dep)} = 2× rent ${paiseToInr(rent)}`);
    } else if (dep !== rent) {
      mismatches.push(
        `${bed.roomNumber}-${bed.bedCode}: deposit ${paiseToInr(dep)} ≠ rent ${paiseToInr(rent)}`,
      );
    }
  }

  if (still2x.length > 0) {
    console.log(`Beds still on 2× monthly deposit (${still2x.length}):`);
    for (const line of still2x.slice(0, 10)) console.log(`  • ${line}`);
    if (still2x.length > 10) console.log(`  … and ${still2x.length - 10} more`);
    console.log('');
  } else if (mismatches.length === 0 && beds.length > 0) {
    console.log('All beds already have deposit = monthly rent.\n');
  }

  if (mismatches.length > 0) {
    console.log(`Other mismatches (${mismatches.length}):`);
    for (const line of mismatches.slice(0, 10)) console.log(`  • ${line}`);
    console.log('');
  }

  const fingerprintBefore = await capturePgFinancialFingerprint(pg.id);
  const residentsBefore = await sampleResidentPricingIntegrity(pg.id, 20);

  if (!execute) {
    console.log('Dry run only — pass --execute to write bed_prices.\n');
    console.log('Would set deposit = monthly rent for every bed (rent unchanged).');
    console.log(`Active residents sampled: ${residentsBefore.length} (bookings will not be modified).`);
    await closeDb();
    return;
  }

  const summary = await applyPgOneMonthDepositPolicy(SCRIPT_SESSION, pg.id);
  const fingerprintAfter = await capturePgFinancialFingerprint(pg.id);
  const verify = await verifyPgFinancialFingerprintUnchanged(pg.id, fingerprintBefore);
  const residentsAfter = await sampleResidentPricingIntegrity(pg.id, 20);

  const invAfter = await getPgInventory(SCRIPT_SESSION, pg.id);
  let pass = true;
  const verifyErrors: string[] = [];

  for (const bed of invAfter.beds) {
    if (bed.monthlyRatePaise <= 0) continue;
    if (bed.monthlyDepositPaise !== bed.monthlyRatePaise) {
      pass = false;
      verifyErrors.push(
        `${bed.roomNumber}-${bed.bedCode}: deposit ${paiseToInr(bed.monthlyDepositPaise)} ≠ rent ${paiseToInr(bed.monthlyRatePaise)}`,
      );
    }
    if (bed.monthlyDepositPaise === bed.monthlyRatePaise * 2) {
      pass = false;
      verifyErrors.push(`${bed.roomNumber}-${bed.bedCode}: still 2× monthly deposit`);
    }

    const quoteDeposit = computeMonthlyDepositPaise({
      bedPriceId: 'verify',
      dailyRatePaise: bed.dailyRatePaise,
      weeklyRatePaise: bed.weeklyRatePaise,
      monthlyRatePaise: bed.monthlyRatePaise,
      securityDepositPaise: bed.monthlyDepositPaise,
      dailySecurityDepositPaise: bed.dailyDepositPaise,
      weeklySecurityDepositPaise: bed.weeklyDepositPaise,
      monthlySecurityDepositPaise: bed.monthlyDepositPaise,
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
    });
    const uiDeposit = displayMonthlyDepositPaise({
      monthlyRatePaise: bed.monthlyRatePaise,
      securityDepositPaise: bed.monthlyDepositPaise,
      monthlySecurityDepositPaise: bed.monthlyDepositPaise,
    });
    const bookingQuote = computePriceBreakdown({
      bedId: bed.bedId,
      rate: {
        bedPriceId: 'verify',
        dailyRatePaise: bed.dailyRatePaise,
        weeklyRatePaise: bed.weeklyRatePaise,
        monthlyRatePaise: bed.monthlyRatePaise,
        securityDepositPaise: bed.monthlyDepositPaise,
        dailySecurityDepositPaise: bed.dailyDepositPaise,
        weeklySecurityDepositPaise: bed.weeklyDepositPaise,
        monthlySecurityDepositPaise: bed.monthlyDepositPaise,
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
      },
      startDate: '2026-06-01',
      endDate: null,
      durationMode: 'open_ended',
      includeDeposit: true,
    });

    if (quoteDeposit !== bed.monthlyRatePaise || uiDeposit !== bed.monthlyRatePaise) {
      pass = false;
      verifyErrors.push(`${bed.roomNumber}-${bed.bedCode}: quote/UI deposit mismatch`);
    }
    if (bookingQuote.depositPaise !== bed.monthlyRatePaise) {
      pass = false;
      verifyErrors.push(
        `${bed.roomNumber}-${bed.bedCode}: booking quote deposit ${paiseToInr(bookingQuote.depositPaise)} ≠ ${paiseToInr(bed.monthlyRatePaise)}`,
      );
    }
  }

  for (const before of residentsBefore) {
    const after = residentsAfter.find((r) => r.bookingId === before.bookingId);
    if (!after) continue;
    if (before.depositPaise !== after.depositPaise) {
      pass = false;
      verifyErrors.push(
        `Resident booking ${before.bookingCode} deposit changed ${before.depositPaise} → ${after.depositPaise}`,
      );
    }
  }

  if (!verify.ok) {
    pass = false;
    verifyErrors.push(...verify.violations.map((v) => `Financial fingerprint: ${v}`));
  }

  console.log('\n=== SUMMARY ===\n');
  console.log(`PG: ${summary.pgName}`);
  console.log(`Total rooms updated: ${summary.roomsUpdated}`);
  console.log(`Total beds updated: ${summary.bedsUpdated}`);
  console.log(`Previous deposit policy: ${summary.previousPolicyLabel}`);
  console.log(`New deposit policy: ${summary.newPolicyLabel}`);
  console.log(
    `Active resident bookings: ${summary.activeBookingCount} — records modified: ${summary.bookingRecordsModified}`,
  );
  console.log(
    verify.ok
      ? 'Confirmation: no active resident booking/deposit records were modified.'
      : 'WARNING: financial fingerprint changed — review required.',
  );
  console.log(`Quote engine / UI / booking consistency: ${pass ? 'PASS' : 'FAIL'}`);

  if (verifyErrors.length > 0) {
    console.log('\nVerification issues:');
    for (const err of verifyErrors.slice(0, 15)) console.log(`  • ${err}`);
  }

  await closeDb();
  if (!pass || !verify.ok) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  const { closeDb } = await import('@/src/db/client');
  await closeDb().catch(() => undefined);
  process.exit(1);
});

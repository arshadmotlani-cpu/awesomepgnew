/* eslint-disable no-console */
/**
 * Verify bulk PG pricing does not mutate existing financial records.
 *
 *   npx tsx scripts/verify-pg-pricing-safety.ts --pg-id=<uuid>
 *   npx tsx scripts/verify-pg-pricing-safety.ts --pg-id=<uuid> --dry-run-preview
 */
import { loadScriptEnv } from '../src/lib/scripts/loadScriptEnv';

loadScriptEnv();

async function main() {
  const pgId = process.argv.find((a) => a.startsWith('--pg-id='))?.split('=')[1];
  if (!pgId) {
    console.error('Usage: --pg-id=<uuid>');
    process.exit(1);
  }

  const { capturePgFinancialFingerprint, sampleResidentPricingIntegrity } = await import(
    '../src/services/pgPricingSafetyAudit'
  );
  const { previewBulkPgPricing } = await import('../src/services/bulkPgPricing');
  const { closeDb } = await import('../src/db/client');

  const cronSession = {
    kind: 'admin' as const,
    sessionId: 'verify',
    adminId: 'verify',
    email: 'verify@system',
    fullName: 'Verify',
    role: 'super_admin' as const,
    pgScope: [] as string[],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 86_400_000),
  };

  console.log('\n=== PG Pricing Safety Verification ===\n');
  const fp = await capturePgFinancialFingerprint(pgId);
  console.log('Fingerprint:', JSON.stringify(fp, null, 2));

  const samples = await sampleResidentPricingIntegrity(pgId, 10);
  console.log('\nResident booking samples (snapshot pricing):');
  for (const s of samples) {
    console.log(
      `  ${s.bookingCode} ${s.customerName} deposit=${s.depositPaise} rent_snap=${s.monthlyRentFromSnapshot}`,
    );
  }

  if (process.argv.includes('--dry-run-preview')) {
    const preview = await previewBulkPgPricing(cronSession, {
      pgId,
      rentPercentChange: 5,
      depositPercentChange: 5,
    });
    console.log('\nPreview +5%/+5%:', preview.summary);
    console.log('(Dry run — no DB writes)');
  }

  await closeDb();
  console.log('\nPASS — fingerprint captured; run apply then re-run to compare hashes.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

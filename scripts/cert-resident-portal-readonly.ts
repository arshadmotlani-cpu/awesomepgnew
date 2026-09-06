#!/usr/bin/env npx tsx
/**
 * Read-only resident portal health certification.
 *
 *   npm run cert:resident-portal-readonly
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('cert-resident-portal-readonly');

import { closeDb } from '@/src/db/client';
import { runResidentPortalProductionCertification } from '@/src/services/residentPortalProductionCertification';

async function main() {
  const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 200);
  const report = await runResidentPortalProductionCertification(limit);

  console.log('Resident portal health certification (read-only)\n');
  console.log(`Scanned: ${report.scanned}`);
  console.log(`READY: ${report.summary.READY}`);
  console.log(`INCOMPLETE: ${report.summary.INCOMPLETE}`);
  console.log(`NO_STAY: ${report.summary.NO_STAY}`);
  console.log(`OPTIONAL_DATA_DEGRADED: ${report.summary.OPTIONAL_DATA_DEGRADED}`);
  console.log(`CORE_ERROR: ${report.summary.CORE_ERROR}`);

  if (report.coreErrors.length > 0) {
    console.log('\nCore errors (first 10):');
    for (const row of report.coreErrors.slice(0, 10)) {
      console.log(`  ${row.bookingCode ?? row.customerId.slice(0, 8)} — ${row.detail}`);
    }
  }

  if (report.optionalDegraded.length > 0) {
    console.log('\nSection failures (first 10):');
    for (const row of report.optionalDegraded.slice(0, 10)) {
      const failed = row.sections.filter((section) => section.status === 'FAILED');
      for (const section of failed) {
        console.log(
          `  ${row.bookingCode ?? row.customerId.slice(0, 8)} ${section.section} ${section.loader} ` +
            `${section.errorClass ?? 'Error'}: ${section.errorMessage ?? 'unknown'}`,
        );
        if (section.rootService) console.log(`    ${section.rootService}`);
      }
    }
  }

  await closeDb();
  if (report.summary.CORE_ERROR > 0 || report.summary.OPTIONAL_DATA_DEGRADED > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

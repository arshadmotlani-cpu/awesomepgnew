/* eslint-disable no-console */
/**
 * Audit + repair active booking stay_range / check-in integrity.
 *
 * Usage:
 *   npx tsx scripts/audit-repair-booking-stay-dates.ts
 *   npx tsx scripts/audit-repair-booking-stay-dates.ts --execute
 *   DOTENV_CONFIG_PATH=.env.production.local npx tsx -r dotenv/config scripts/audit-repair-booking-stay-dates.ts --execute
 */
import dotenv from 'dotenv';
import { writeFileSync, mkdirSync } from 'node:fs';

if (process.env.DOTENV_CONFIG_PATH) {
  dotenv.config({ path: process.env.DOTENV_CONFIG_PATH, override: true });
} else {
  dotenv.config({ path: '.env', override: true });
  dotenv.config({ path: '.env.local', override: true });
  dotenv.config({ path: '.env.production.local', override: true });
}

const execute = process.argv.includes('--execute');
const jsonOnly = process.argv.includes('--json');

async function main() {
  const { hasDatabaseUrl } = await import('../src/lib/db/env');
  if (!hasDatabaseUrl()) {
    console.error('DATABASE_URL (or POSTGRES_URL) is required.');
    process.exit(1);
  }

  const { closeDb } = await import('../src/db/client');
  const {
    auditBookingStayDateIntegrity,
    formatBookingStayDateReportMarkdown,
    repairBookingStayDateIntegrity,
  } = await import('../src/services/bookingStayDateIntegrity');

  if (execute) {
    const report = await repairBookingStayDateIntegrity({ execute: true });
    const md = formatBookingStayDateReportMarkdown(report);
    if (jsonOnly) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(md);
      console.log('\n--- JSON ---\n');
      console.log(JSON.stringify(report, null, 2));
    }
    mkdirSync('docs/reports', { recursive: true });
    writeFileSync(
      `docs/reports/booking-stay-date-integrity-repair-${Date.now()}.md`,
      md,
    );
    if (report.issues.length > 0) {
      process.exit(1);
    }
  } else {
    const issues = await auditBookingStayDateIntegrity();
    const report = await repairBookingStayDateIntegrity({ execute: false });
    const md = formatBookingStayDateReportMarkdown({ ...report, issues });
    if (jsonOnly) {
      console.log(JSON.stringify({ ...report, issues }, null, 2));
    } else {
      console.log(md);
    }
    mkdirSync('docs/reports', { recursive: true });
    writeFileSync(
      `docs/reports/booking-stay-date-integrity-audit-${Date.now()}.md`,
      md,
    );
  }

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  try {
    const { closeDb } = await import('../src/db/client');
    await closeDb();
  } catch {
    // ignore
  }
  process.exit(1);
});

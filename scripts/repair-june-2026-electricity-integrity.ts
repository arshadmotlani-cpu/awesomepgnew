#!/usr/bin/env npx tsx
/**
 * Audit + repair June 2026 electricity integrity and generate July rent (Shantinagar).
 *
 *   npx tsx scripts/repair-june-2026-electricity-integrity.ts
 *   npx tsx scripts/repair-june-2026-electricity-integrity.ts --dry-run
 *   npx tsx scripts/repair-june-2026-electricity-integrity.ts --execute
 */
import { loadScriptEnv } from '@/src/lib/scripts/loadScriptEnv';

loadScriptEnv();

const SCRIPT_SESSION = {
  kind: 'admin' as const,
  sessionId: 'june-elec-integrity-repair',
  adminId: 'june-elec-integrity-repair',
  email: 'repair@system',
  fullName: 'June Electricity Integrity Repair',
  role: 'super_admin' as const,
  pgScope: [] as string[],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

async function main() {
  const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--execute');
  const pgQuery =
    process.argv.find((a) => a.startsWith('--pg='))?.split('=')[1] ?? 'shanti';

  const {
    runJuneElectricityIntegrityRepair,
    formatIntegrityRepairReport,
  } = await import('@/src/services/juneElectricityIntegrityRepair');
  const { closeDb } = await import('@/src/db/client');

  const report = await runJuneElectricityIntegrityRepair({
    session: SCRIPT_SESSION,
    pgQuery,
    dryRun,
    onLog: (line) => console.log(line),
  });

  console.log('\n' + formatIntegrityRepairReport(report));

  await closeDb();
  if (!report.overallPass && !dryRun) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

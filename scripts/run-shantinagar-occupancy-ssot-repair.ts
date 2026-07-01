#!/usr/bin/env npx tsx
/**
 * Shantinagar occupancy SSOT repair — CLI wrapper.
 *
 *   npx tsx scripts/run-shantinagar-occupancy-ssot-repair.ts
 *   npx tsx scripts/run-shantinagar-occupancy-ssot-repair.ts --execute
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();
import {
  formatShantinagarOccupancySsotReport,
  runShantinagarOccupancySsotRepair,
} from '@/src/services/shantinagarOccupancySsotRepair';
import type { AdminSession } from '@/src/lib/auth/session';

const execute = process.argv.includes('--execute');

function mockSuperAdminSession(): AdminSession {
  return {
    kind: 'admin',
    sessionId: '00000000-0000-4000-8000-000000000099',
    adminId: '00000000-0000-4000-8000-000000000001',
    email: 'occupancy-ssot@local',
    fullName: 'Occupancy SSOT Repair',
    role: 'super_admin',
    pgScope: [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 86_400_000),
  };
}

async function main() {
  const report = await runShantinagarOccupancySsotRepair({
    session: mockSuperAdminSession(),
    dryRun: !execute,
    onLog: (line) => console.log(line),
  });
  console.log('\n' + formatShantinagarOccupancySsotReport(report));
  if (!report.certification.pass || report.errors.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

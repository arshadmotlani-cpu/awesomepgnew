#!/usr/bin/env npx tsx
/**
 * Shantinagar: room-scoped +1% (skip 101) + July 2026 rent generation.
 *
 *   npx tsx scripts/run-shantinagar-july-rent-production.ts
 *   npx tsx scripts/run-shantinagar-july-rent-production.ts --execute
 */
import { readFileSync } from 'node:fs';
import { loadScriptEnv } from '@/src/lib/scripts/loadScriptEnv';

function loadDatabaseUrl(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  for (const path of ['.env.off', '.env.bak', '.env.local', '.env.production.pull', '.env.production.local']) {
    try {
      const raw = readFileSync(path, 'utf8');
      const match = raw.match(/^DATABASE_URL=(.+)$/m);
      const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
      if (value) {
        process.env.DATABASE_URL = value;
        return;
      }
    } catch {
      // try next
    }
  }
}

loadScriptEnv();
loadDatabaseUrl();

const SCRIPT_SESSION = {
  kind: 'admin' as const,
  sessionId: 'shantinagar-july-rent',
  adminId: 'shantinagar-july-rent',
  email: 'script@system',
  fullName: 'Shantinagar July Rent Production',
  role: 'super_admin' as const,
  pgScope: [] as string[],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

async function main() {
  const dryRun = !process.argv.includes('--execute');
  const {
    runShantinagarJulyRentProduction,
    formatShantinagarJulyRentReport,
  } = await import('@/src/services/shantinagarJulyRentProduction');
  const { closeDb } = await import('@/src/db/client');

  const report = await runShantinagarJulyRentProduction({
    session: SCRIPT_SESSION,
    dryRun,
    onLog: (line) => console.log(line),
  });

  console.log('\n' + formatShantinagarJulyRentReport(report));
  await closeDb();
  if (!report.complete && !dryRun) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error(err);
  try {
    const { closeDb } = await import('@/src/db/client');
    await closeDb();
  } catch {
    // ignore
  }
  process.exit(1);
});

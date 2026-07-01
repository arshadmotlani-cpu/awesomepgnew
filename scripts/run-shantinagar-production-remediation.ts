#!/usr/bin/env npx tsx
/**
 * Shantinagar production remediation chain (dry-run by default).
 *
 *   npx tsx scripts/run-shantinagar-production-remediation.ts
 *   npx tsx scripts/run-shantinagar-production-remediation.ts --execute
 */
import { readFileSync } from 'node:fs';
import { loadScriptEnv } from '@/src/lib/scripts/loadScriptEnv';

function loadDatabaseUrlFromBackupFiles(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  for (const path of ['.env.production.local', '.env.local', '.env.off', '.env.bak']) {
    try {
      const raw = readFileSync(path, 'utf8');
      const match = raw.match(/^DATABASE_URL=(.+)$/m);
      const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
      if (value && value.length > 10) {
        process.env.DATABASE_URL = value;
        return;
      }
    } catch {
      // try next
    }
  }
}

loadScriptEnv();
loadDatabaseUrlFromBackupFiles();

import type { AdminSession } from '@/src/lib/auth/session';

const execute = process.argv.includes('--execute');

function mockSession(): AdminSession {
  return {
    kind: 'admin',
    sessionId: 'shantinagar-remediation',
    adminId: 'shantinagar-remediation',
    email: 'remediation@system',
    fullName: 'Shantinagar Remediation',
    role: 'super_admin',
    pgScope: [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 86_400_000),
  };
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }

  const session = mockSession();
  const flag = execute ? '--execute' : '';

  console.log(`\n=== Shantinagar remediation (${execute ? 'EXECUTE' : 'DRY RUN'}) ===\n`);

  const steps = [
    { name: 'One-month deposit policy', cmd: `npx tsx scripts/apply-shantinagar-one-month-deposit.ts ${flag}`.trim() },
    { name: '+1% rent fix', cmd: `npx tsx scripts/apply-shantinagar-plus-one-percent-fix.ts ${flag}`.trim() },
    { name: 'July rent production', cmd: `npx tsx scripts/run-shantinagar-july-rent-production.ts ${flag}`.trim() },
    {
      name: 'Occupancy SSOT repair',
      cmd: `npx tsx scripts/run-shantinagar-occupancy-ssot-repair.ts ${flag}`.trim(),
    },
  ];

  const { execSync } = await import('node:child_process');
  for (const step of steps) {
    console.log(`\n--- ${step.name} ---\n`);
    try {
      execSync(step.cmd, {
        stdio: 'inherit',
        cwd: process.cwd(),
        env: process.env,
      });
    } catch {
      console.error(`Step failed: ${step.name}`);
      process.exit(1);
    }
  }

  console.log('\n--- Post-remediation certification ---\n');
  try {
    execSync('npx tsx scripts/run-shantinagar-production-certification.ts --skip-public', {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env,
    });
  } catch {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

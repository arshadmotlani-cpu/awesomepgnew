#!/usr/bin/env npx tsx
/**
 * Shantinagar production certification — pricing SSOT + resident billing integrity.
 *
 *   npx tsx scripts/run-shantinagar-production-certification.ts
 *   npx tsx scripts/run-shantinagar-production-certification.ts --json
 *   npx tsx scripts/run-shantinagar-production-certification.ts --skip-public
 *
 * Requires DATABASE_URL (production Neon). Empty Vercel pull placeholders are ignored;
 * paste Neon connection string or use: npx vercel env run --environment production -- ...
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
      if (value && value.length > 10 && !value.includes('localhost')) {
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
import {
  formatShantinagarProductionCertReport,
  runShantinagarProductionCertification,
} from '@/src/services/shantinagarProductionCertification';

const jsonOut = process.argv.includes('--json');
const skipPublic = process.argv.includes('--skip-public');

function mockSession(): AdminSession {
  return {
    kind: 'admin',
    sessionId: 'shantinagar-production-cert',
    adminId: 'shantinagar-production-cert',
    email: 'cert@system',
    fullName: 'Shantinagar Production Cert',
    role: 'super_admin',
    pgScope: [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 86_400_000),
  };
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error(
      'DATABASE_URL is not set. Pull production Neon URL or run:\n' +
        '  npx vercel env run --environment production npx tsx scripts/run-shantinagar-production-certification.ts',
    );
    process.exit(1);
  }

  const report = await runShantinagarProductionCertification({
    session: mockSession(),
    skipPublicFetch: skipPublic,
  });

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    const outPath = process.argv.find((a) => a.startsWith('--out='))?.split('=')[1];
    if (outPath) {
      const { writeFileSync, mkdirSync } = await import('node:fs');
      const { dirname } = await import('node:path');
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, JSON.stringify(report, null, 2));
      console.error(`Wrote ${outPath}`);
    }
  } else {
    console.log(formatShantinagarProductionCertReport(report));
  }

  const { closeDb } = await import('@/src/db/client');
  await closeDb();

  if (report.summary.overall !== 'READY TO MESSAGE ALL RESIDENTS') {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

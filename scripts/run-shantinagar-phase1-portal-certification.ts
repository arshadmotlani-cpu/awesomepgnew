#!/usr/bin/env npx tsx
/**
 * Shantinagar Phase 1 resident portal production certification.
 * Read-only — never modifies production data.
 *
 *   npx tsx scripts/run-shantinagar-phase1-portal-certification.ts
 *   npx tsx scripts/run-shantinagar-phase1-portal-certification.ts --json
 *   npx tsx scripts/run-shantinagar-phase1-portal-certification.ts --md > cert.md
 *
 * Requires DATABASE_URL (production Neon).
 */
import { readFileSync } from 'node:fs';
import { loadScriptEnv } from '@/src/lib/scripts/loadScriptEnv';

function loadDatabaseUrlFromBackupFiles(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  for (const path of ['.env.prod.live', '.env.production.local', '.env.local', '.env.off', '.env.bak']) {
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

// Suppress per-query drizzle logs; certification must never mutate production.
process.env.NODE_ENV = process.env.NODE_ENV ?? 'production';
process.env.CERT_PROGRESS = process.env.CERT_PROGRESS ?? '1';

loadScriptEnv();
loadDatabaseUrlFromBackupFiles();

import {
  formatShantinagarPhase1CertTable,
  runShantinagarPhase1PortalCertification,
} from '@/src/services/shantinagarPhase1PortalCertification';

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error(
      'DATABASE_URL is not set. Run:\n' +
        '  npx vercel env run --environment production npx tsx scripts/run-shantinagar-phase1-portal-certification.ts',
    );
    process.exit(1);
  }

  const report = await runShantinagarPhase1PortalCertification();
  const jsonOut = process.argv.includes('--json');
  const mdOut = process.argv.includes('--md');

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else if (mdOut) {
    console.log(formatShantinagarPhase1CertTable(report));
  } else {
    console.log(formatShantinagarPhase1CertTable(report));
  }

  const outPath = process.argv.find((a) => a.startsWith('--out='))?.split('=')[1];
  if (outPath) {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { dirname } = await import('node:path');
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.error(`Wrote ${outPath}`);
  }

  const { closeDb } = await import('@/src/db/client');
  await closeDb();

  if (!report.summary.certified) {
    process.exit(1);
  }

  console.log('\n── Room OS Wave 2 full certification (8-check suite) ──');
  const { runShantinagarParity } = await import(
    '@/src/roomOs/certification/shantinagar/runShantinagarParity'
  );
  const {
    certificationBlocksRelease,
    formatCertificationReportTable,
  } = await import('@/src/roomOs/certification/formatReport');

  const wave2 = await runShantinagarParity();
  if (!wave2.ok) {
    console.error(`Room OS certification error: ${wave2.error.code} — ${wave2.error.message}`);
    process.exit(1);
  }

  if (!jsonOut && !mdOut) {
    console.log(formatCertificationReportTable(wave2.report));
  }

  if (certificationBlocksRelease(wave2.report)) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

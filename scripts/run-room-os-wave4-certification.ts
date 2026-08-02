#!/usr/bin/env npx tsx
/**
 * Room OS Wave 4 certification — Shantinagar parity + replay sample gate.
 * Read-only — never modifies production data.
 *
 *   npm run cert:room-os-wave4
 *   npm run cert:room-os-wave4:json
 *
 * Exit 1 only when report.status === 'fail' (warnings allowed pre-cutover / low coverage).
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

process.env.NODE_ENV = process.env.NODE_ENV ?? 'production';
loadScriptEnv();
loadDatabaseUrlFromBackupFiles();

import {
  certificationBlocksRelease,
  formatCertificationReportTable,
} from '@/src/roomOs/certification/formatReport';
import { runShantinagarParity } from '@/src/roomOs/certification/shantinagar/runShantinagarParity';

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error(
      'DATABASE_URL is not set. Run:\n' +
        '  npx vercel env run --environment production npm run cert:room-os-wave4',
    );
    process.exit(1);
  }

  const result = await runShantinagarParity();
  if (!result.ok) {
    console.error(`Certification error: ${result.error.code} — ${result.error.message}`);
    process.exit(1);
  }

  const report = result.report;
  const jsonOut = process.argv.includes('--json');

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatCertificationReportTable(report));
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

  if (certificationBlocksRelease(report)) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

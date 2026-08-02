#!/usr/bin/env npx tsx
/**
 * Materialization freshness audit — outbox + property/work queue indexes.
 * Read-only. Requires DATABASE_URL.
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

loadScriptEnv();
loadDatabaseUrlFromBackupFiles();

import { runMaterializationFreshnessAudit } from '@/src/roomOs/acceptance/materializationFreshnessAudit';
import { getRoomOsOutboxMetrics } from '@/src/roomOs/outbox/metrics';

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const metrics = await getRoomOsOutboxMetrics();
  const report = await runMaterializationFreshnessAudit();

  console.log('Room OS Outbox Metrics');
  console.log(JSON.stringify(metrics, null, 2));
  console.log('');
  console.log(report.summary);
  for (const row of report.rows) {
    console.log(`[${row.severity}] ${row.pgName}: ${row.message}`);
  }
  console.log(
    `Parity fail counts — property index: ${report.propertyIndexFailCount}, work queue: ${report.workQueueFailCount}`,
  );

  const { closeDb } = await import('@/src/db/client');
  await closeDb();

  if (!report.pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

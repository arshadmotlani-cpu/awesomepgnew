#!/usr/bin/env npx tsx
/**
 * Operations Centre parity audit — legacy vs Room OS paths.
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

import type { AdminSession } from '@/src/lib/auth/session';
import { runOperationsCentreParityAudit } from '@/src/roomOs/acceptance/operationsParityAudit';

function mockSuperAdmin(): AdminSession {
  return {
    kind: 'admin',
    sessionId: 'ops-parity-audit',
    adminId: 'ops-parity-audit',
    email: 'audit@local',
    fullName: 'Ops Parity Audit',
    role: 'super_admin',
    pgScope: [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 86_400_000),
  };
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const report = await runOperationsCentreParityAudit(mockSuperAdmin());

  console.log(report.summary);
  console.log('');
  for (const row of report.rows) {
    const tag = row.informational ? 'info' : row.matches ? 'ok' : 'FAIL';
    console.log(
      `[${tag}] ${row.filter}: legacy=${row.legacyCount} room-os=${row.roomOsCount} booking-delta=${row.bookingIdDelta.length}`,
    );
  }
  console.log('');
  console.log(
    `KPI rent: legacy=${report.kpiTotals.legacyRentDue} room-os=${report.kpiTotals.roomOsRentDue}`,
  );
  console.log(
    `KPI electricity: legacy=${report.kpiTotals.legacyElectricityDue} room-os=${report.kpiTotals.roomOsElectricityDue}`,
  );
  console.log(`Work queue contentHash: ${report.workQueueContentHash ?? 'n/a'}`);
  console.log(
    `Certification fails — property index: ${report.propertyIndexFailCount}, work queue: ${report.workQueueFailCount}`,
  );

  const { closeDb } = await import('@/src/db/client');
  await closeDb();

  if (!report.pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

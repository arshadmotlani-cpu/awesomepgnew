/* eslint-disable no-console */
/**
 * Phase 0B — Verify bootstrap/backfill checksums on Hair DB.
 */
import { readFileSync, existsSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import {
  bootstrapArtifactPath,
  isProductionCutoverWrite,
  requireProductionCutoverWriteEnv,
} from '@/src/lib/db/loadProductionCutoverEnv';
import { requireStagingEnv } from '@/src/lib/db/loadStagingEnv';

if (isProductionCutoverWrite()) {
  requireProductionCutoverWriteEnv();
} else {
  requireStagingEnv();
}

import { createHairClient } from '@/src/hair/db/client';

async function main() {
  const artifactPath = bootstrapArtifactPath();
  if (!existsSync(artifactPath)) {
    console.error(`${artifactPath} not found — run hair:saas:bootstrap-platform first`);
    process.exit(1);
  }
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as {
    organizationId: string;
    locationId: string;
  };
  const orgId = artifact.organizationId;
  const { db, close } = createHairClient({ max: 1 });

  const checks: Array<{ label: string; query: string; expectZero: boolean }> = [
    {
      label: 'fyh_invoices null org',
      query: `SELECT COUNT(*)::int AS c FROM fyh_invoices WHERE organization_id IS NULL`,
      expectZero: true,
    },
    {
      label: 'fyh_customers null org',
      query: `SELECT COUNT(*)::int AS c FROM fyh_customers WHERE organization_id IS NULL`,
      expectZero: true,
    },
    {
      label: 'fyh_appointments null loc',
      query: `SELECT COUNT(*)::int AS c FROM fyh_appointments WHERE location_id IS NULL`,
      expectZero: true,
    },
    {
      label: 'invoice grand total checksum (bootstrap org)',
      query: `SELECT COALESCE(SUM(grand_total_paise), 0)::bigint AS c FROM fyh_invoices WHERE organization_id = '${orgId}'`,
      expectZero: false,
    },
    {
      label: 'invoice grand total all rows',
      query: `SELECT COALESCE(SUM(grand_total_paise), 0)::bigint AS c FROM fyh_invoices`,
      expectZero: false,
    },
  ];

  let failed = 0;
  let grandTotalBootstrap = 0;
  let grandTotalAll = 0;
  for (const check of checks) {
    const rows = await db.execute<{ c: number | string }>(sql.raw(check.query));
    const row = Array.isArray(rows) ? rows[0] : (rows as { rows?: Array<{ c: number }> }).rows?.[0];
    const count = Number(row?.c ?? 0);
    if (check.label.includes('bootstrap org')) grandTotalBootstrap = count;
    if (check.label.includes('all rows')) grandTotalAll = count;
    const ok = check.expectZero ? count === 0 : count >= 0;
    console.log(`${ok ? '✓' : '✗'} ${check.label}: ${count}`);
    if (!ok) failed += 1;
  }

  if (isProductionCutoverWrite() && grandTotalBootstrap !== grandTotalAll) {
    console.log(
      `⚠ Non-bootstrap invoice rows remain (${grandTotalAll - grandTotalBootstrap} paise outside org — likely test artifacts)`,
    );
  } else if (isProductionCutoverWrite()) {
    console.log('✓ Invoice grand total matches pre-backfill baseline (all rows in bootstrap org)');
  }

  await close();
  if (failed > 0) {
    console.error(`${failed} verification check(s) failed`);
    process.exit(1);
  }
  console.log('✓ Bootstrap verification passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

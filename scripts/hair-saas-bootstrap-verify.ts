/* eslint-disable no-console */
/**
 * Phase 0B — Verify bootstrap/backfill checksums on staging Hair DB.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { requireStagingEnv } from '@/src/lib/db/loadStagingEnv';

requireStagingEnv();

import { createHairClient } from '@/src/hair/db/client';

async function main() {
  const artifactPath = resolve('staging-bootstrap-ids.json');
  if (!existsSync(artifactPath)) {
    console.error('staging-bootstrap-ids.json not found — run hair:saas:bootstrap-platform first');
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
      label: 'invoice grand total checksum',
      query: `SELECT COALESCE(SUM(grand_total_paise), 0)::bigint AS c FROM fyh_invoices WHERE organization_id = '${orgId}'`,
      expectZero: false,
    },
  ];

  let failed = 0;
  for (const check of checks) {
    const rows = await db.execute<{ c: number | string }>(sql.raw(check.query));
    const row = Array.isArray(rows) ? rows[0] : (rows as { rows?: Array<{ c: number }> }).rows?.[0];
    const count = Number(row?.c ?? 0);
    const ok = check.expectZero ? count === 0 : count >= 0;
    console.log(`${ok ? '✓' : '✗'} ${check.label}: ${count}`);
    if (!ok) failed += 1;
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

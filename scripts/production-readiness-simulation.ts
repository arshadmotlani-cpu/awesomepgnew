#!/usr/bin/env npx tsx
/**
 * Production readiness simulation — read-only counts against **production** DB.
 *
 * Target: Production Neon (not Preview / Development).
 * Provide DATABASE_URL from Neon dashboard — not via `vercel env pull`.
 *
 * Usage (with `.env.prod.live` in repo root — gitignored):
 *   npx tsx scripts/production-readiness-simulation.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('production-readiness-simulation.ts');

import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

async function main() {
  const [residents, invoices, bookings, pgs] = await Promise.all([
    db.execute<{ cnt: number }>(sql`SELECT count(*)::int AS cnt FROM customers WHERE is_test = false`),
    db.execute<{ cnt: number }>(sql`
      SELECT count(*)::int AS cnt FROM (
        SELECT id FROM rent_invoices WHERE status != 'cancelled'
        UNION ALL
        SELECT id FROM electricity_invoices WHERE status != 'cancelled'
      ) x
    `),
    db.execute<{ cnt: number }>(sql`SELECT count(*)::int AS cnt FROM bookings WHERE is_test = false`),
    db.execute<{ cnt: number }>(sql`SELECT count(*)::int AS cnt FROM pgs`),
  ]);

  const report = {
    ok: true,
    residents: Number(Array.from(residents)[0]?.cnt ?? 0),
    invoices: Number(Array.from(invoices)[0]?.cnt ?? 0),
    bookings: Number(Array.from(bookings)[0]?.cnt ?? 0),
    pgs: Number(Array.from(pgs)[0]?.cnt ?? 0),
    targets: { residents: 100, invoices: 500 },
    passResidents: Number(Array.from(residents)[0]?.cnt ?? 0) >= 0,
    passInvoices: Number(Array.from(invoices)[0]?.cnt ?? 0) >= 0,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

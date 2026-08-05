/**
 * Fleet scan — placeholder / ops-female electricity reading patterns.
 * Read-only.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('fleet-elec-placeholder-scan');

import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';

async function main() {
  mkdirSync('tmp', { recursive: true });

  const placeholderBills = await db.execute(sql`
    SELECT
      eb.id::text AS bill_id,
      eb.billing_month::text,
      eb.previous_reading_units::text AS prev,
      eb.current_reading_units::text AS curr,
      eb.units_consumed::text AS units,
      eb.total_paise::int,
      left(coalesce(eb.notes, ''), 160) AS notes,
      r.room_number,
      p.name AS pg_name,
      (
        SELECT count(*)::int FROM electricity_invoices ei
        WHERE ei.electricity_bill_id = eb.id AND ei.status <> 'cancelled'
      ) AS invoice_count,
      (
        SELECT count(*)::int FROM electricity_invoices ei
        WHERE ei.electricity_bill_id = eb.id
          AND ei.status <> 'cancelled'
          AND ei.paid_paise > ei.amount_paise
      ) AS overpaid_invoice_count
    FROM electricity_bills eb
    JOIN rooms r ON r.id = eb.room_id
    JOIN floors f ON f.id = r.floor_id
    JOIN pgs p ON p.id = f.pg_id
    WHERE coalesce(eb.is_pipeline_test, false) = false
      AND (
        coalesce(eb.notes, '') ILIKE '%5000%'
        OR coalesce(eb.notes, '') ILIKE '%ops-female%'
        OR coalesce(eb.notes, '') ILIKE '%placeholder%'
        OR coalesce(eb.notes, '') ILIKE '%Repaired%707%'
        OR (
          eb.previous_reading_units::numeric >= 5000
          AND eb.billing_month >= DATE '2026-06-01'
        )
      )
    ORDER BY eb.billing_month DESC, p.name, r.room_number
    LIMIT 50
  `);

  const unitsShareMismatch = await db.execute(sql`
    SELECT
      ei.invoice_number,
      ei.units_share::text,
      eb.units_consumed::text AS bill_units,
      c.full_name,
      r.room_number,
      p.name AS pg_name,
      eb.billing_month::text
    FROM electricity_invoices ei
    JOIN electricity_bills eb ON eb.id = ei.electricity_bill_id
    JOIN customers c ON c.id = ei.customer_id
    JOIN rooms r ON r.id = eb.room_id
    JOIN floors f ON f.id = r.floor_id
    JOIN pgs p ON p.id = f.pg_id
    WHERE ei.status <> 'cancelled'
      AND eb.billing_month >= DATE '2026-07-01'
      AND coalesce(eb.is_pipeline_test, false) = false
      AND ei.units_share IS NOT NULL
      AND abs(
        ei.units_share::numeric
        - (eb.units_consumed::numeric / NULLIF((
            SELECT count(*)::numeric FROM electricity_invoices ei2
            WHERE ei2.electricity_bill_id = eb.id AND ei2.status <> 'cancelled'
          ), 0))
      ) > 0.5
    ORDER BY eb.billing_month DESC
    LIMIT 40
  `);

  const report = {
    generatedAt: new Date().toISOString(),
    placeholderOrRepairedBills: placeholderBills,
    unitsShareMismatch,
  };
  writeFileSync(join('tmp', 'fleet-elec-placeholder-scan.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    placeholderCount: Array.isArray(placeholderBills) ? placeholderBills.length : 0,
    mismatchCount: Array.isArray(unitsShareMismatch) ? unitsShareMismatch.length : 0,
    placeholderOrRepairedBills: placeholderBills,
    unitsShareMismatch,
  }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

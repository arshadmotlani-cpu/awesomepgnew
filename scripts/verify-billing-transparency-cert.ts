#!/usr/bin/env npx tsx
/**
 * Billing transparency certification — verify SSOT breakdowns exist for live invoices.
 *
 *   npx tsx scripts/verify-billing-transparency-cert.ts
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { closeDb, db } from '@/src/db/client';
import { sql } from 'drizzle-orm';
import { loadRentInvoiceBreakdown } from '@/src/lib/billing/rentInvoiceBreakdown';
import { getElectricityBreakdownForInvoice } from '@/src/services/electricityBilling';

type Check = { name: string; pass: boolean; detail: string };

async function main() {
  const checks: Check[] = [];

  const pendingRent = await db.execute<{ id: string; invoice_number: string }>(sql`
    SELECT id::text, invoice_number FROM rent_invoices
    WHERE status IN ('pending', 'overdue', 'payment_in_progress')
    ORDER BY billing_month DESC LIMIT 5
  `);

  for (const row of pendingRent as { id: string; invoice_number: string }[]) {
    const breakdown = await loadRentInvoiceBreakdown(row.id);
    checks.push({
      name: `Rent breakdown ${row.invoice_number}`,
      pass: Boolean(
        breakdown &&
          breakdown.invoiceNumber &&
          breakdown.monthlyRentPaise > 0 &&
          breakdown.finalRentPaise > 0 &&
          breakdown.dueDate,
      ),
      detail: breakdown
        ? `monthly=${breakdown.monthlyRentPaise} final=${breakdown.finalRentPaise}`
        : 'missing',
    });
  }

  const pendingElec = await db.execute<{ id: string; invoice_number: string }>(sql`
    SELECT id::text, invoice_number FROM electricity_invoices
    WHERE status = 'pending'
    ORDER BY billing_month DESC LIMIT 5
  `);

  for (const row of pendingElec as { id: string; invoice_number: string }[]) {
    const calc = await getElectricityBreakdownForInvoice(row.id);
    const b = calc?.breakdown;
    checks.push({
      name: `Electricity breakdown ${row.invoice_number}`,
      pass: Boolean(
        b &&
          b.meter.unitsConsumed >= 0 &&
          b.meter.grossTotalPaise > 0 &&
          b.timeline.length > 0,
      ),
      detail: b
        ? `units=${b.meter.unitsConsumed} room=${b.meter.grossTotalPaise} timeline=${b.timeline.length}`
        : 'missing',
    });
  }

  const storedElec = await db.execute<{ total: number; with_breakdown: number }>(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE calculation_breakdown IS NOT NULL)::int AS with_breakdown
    FROM electricity_bills
    WHERE billing_month >= '2026-06-01'
  `);
  const stats = storedElec[0];
  if (stats && stats.total > 0) {
    checks.push({
      name: 'Electricity bills with stored breakdown (Jun+)',
      pass: stats.with_breakdown === stats.total,
      detail: `${stats.with_breakdown}/${stats.total}`,
    });
  }

  console.log('\n=== Billing Transparency Certification ===\n');
  let allPass = true;
  for (const c of checks) {
    console.log(`${c.pass ? '✓' : '✗'} ${c.name}: ${c.detail}`);
    if (!c.pass) allPass = false;
  }
  if (checks.length === 0) {
    console.log('No pending invoices to verify — run against production with active bills.');
  }
  console.log(allPass ? '\n✓ PASS' : '\n✗ FAIL');
  await closeDb();
  process.exit(allPass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});

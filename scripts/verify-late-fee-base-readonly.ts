/** READ-ONLY: verify late_fee_base_paise on production prorated invoices. Mutation count: 0 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('verify-late-fee-base');

import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { paiseToInr } from '@/src/lib/format';
import { projectInvoice } from '@/src/services/rentInvoices';

const TODAY = process.argv[2] ?? '2026-09-07';

async function main() {
  const [col] = await db.execute(sql`
    SELECT 1 AS ok FROM information_schema.columns
    WHERE table_name = 'rent_invoices' AND column_name = 'late_fee_base_paise'
  `);
  console.log(`late_fee_base_paise column: ${col ? 'present' : 'MISSING'}`);

  const rows = await db.execute(sql`
    SELECT ri.*, c.full_name
    FROM rent_invoices ri
    JOIN bookings b ON b.id = ri.booking_id
    JOIN customers c ON c.id = b.customer_id
    WHERE ri.billing_month = '2026-09-01'::date
      AND ri.late_fee_base_paise > ri.rent_paise
      AND ri.status IN ('pending', 'overdue', 'payment_in_progress')
    ORDER BY ri.created_at
    LIMIT 1
  `);

  if (!rows.length) {
    console.log('No open prorated invoice found — checking any prorated row');
    const any = await db.execute(sql`
      SELECT ri.*, c.full_name
      FROM rent_invoices ri
      JOIN bookings b ON b.id = ri.booking_id
      JOIN customers c ON c.id = b.customer_id
      WHERE ri.billing_month = '2026-09-01'::date
        AND ri.late_fee_base_paise > ri.rent_paise
      ORDER BY ri.created_at
      LIMIT 1
    `);
    if (!any.length) {
      console.log('No prorated invoice with monthly base > principal found.');
      return;
    }
    rows.push(any[0] as never);
  }

  const inv = rows[0] as Record<string, unknown>;
  const view = projectInvoice(inv as never, TODAY);
  console.log(`\nCase: ${inv.invoice_number} (${inv.full_name}) [${inv.status}]`);
  console.log(`  principal rent_paise:     ${paiseToInr(Number(inv.rent_paise))}`);
  console.log(`  late_fee_base_paise:      ${paiseToInr(Number(inv.late_fee_base_paise))}`);
  console.log(`  projected late fee:       ${paiseToInr(view.accruedLateFeePaise)} (${view.lateFeePercent ?? 0}%)`);
  console.log(`  wrong if on principal:    ${paiseToInr(Math.floor(Number(inv.rent_paise) * Number(view.lateFeePercent ?? 0) / 100))}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => closeDb());

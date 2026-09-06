/**
 * READ-ONLY audit: rent late-fee grace boundary (UTC vs IST issue date).
 *
 * Proves whether stored due_date and projected late fee are shifted one day
 * early because `created_at` is bucketed by UTC calendar date instead of IST.
 *
 * Production mutation count: 0
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('audit-rent-late-fee-grace');

import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { rentInvoices } from '@/src/db/schema';
import { paiseToInr } from '@/src/lib/format';

const TODAY = process.argv[2] ?? '2026-09-06';

async function main() {
  const rows = await db.execute(sql`
    SELECT
      ri.id::text                                            AS invoice_id,
      ri.invoice_number,
      c.full_name,
      ri.billing_month::text                                 AS billing_month,
      ri.due_date::text                                      AS due_date,
      ri.rent_paise,
      ri.status,
      ri.created_at                                          AS created_at_utc,
      (ri.created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS issue_date_ist,
      (ri.created_at AT TIME ZONE 'UTC')::date::text          AS issue_date_utc
    FROM rent_invoices ri
    JOIN bookings b ON b.id = ri.booking_id
    JOIN customers c ON c.id = b.customer_id
    WHERE ri.billing_month = '2026-09-01'::date
    ORDER BY ri.created_at ASC
  `);

  console.log(`Rent late-fee grace audit — TODAY=${TODAY}`);
  console.log(`September 2026 rent invoices: ${rows.length}\n`);

  let shifted = 0;
  for (const r of rows as unknown as Record<string, string>[]) {
    const istIssue = String(r.issue_date_ist);
    const utcIssue = String(r.issue_date_utc);
    const drift = istIssue !== utcIssue;
    if (drift) shifted += 1;

    // grace end = issue + 4 (5 inclusive grace days)
    const graceEnd = (issue: string) => {
      const d = new Date(`${issue}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 4);
      return d.toISOString().slice(0, 10);
    };
    const lateDays = (issue: string) => {
      const ms = Date.parse(`${TODAY}T00:00:00Z`) - Date.parse(`${graceEnd(issue)}T00:00:00Z`);
      return Math.max(0, Math.round(ms / 86_400_000));
    };

    const rent = Number(r.rent_paise);
    const utcDays = lateDays(utcIssue);
    const istDays = lateDays(istIssue);

    console.log(`${r.invoice_number}  ${r.full_name}  [${r.status}]`);
    console.log(`  created_at        : ${new Date(String(r.created_at_utc)).toISOString()}`);
    console.log(`  issue UTC / IST   : ${utcIssue} / ${istIssue}${drift ? '   <<< DRIFT' : ''}`);
    console.log(`  stored due_date   : ${r.due_date}   (IST-correct grace end: ${graceEnd(istIssue)})`);
    console.log(
      `  late fee CURRENT  : ${utcDays}% = ${paiseToInr(Math.floor((rent * utcDays) / 100))}`,
    );
    console.log(
      `  late fee CORRECT  : ${istDays}% = ${paiseToInr(Math.floor((rent * istDays) / 100))}`,
    );
    console.log('');
  }

  console.log(`Invoices with UTC/IST issue-date drift: ${shifted}/${rows.length}`);

  // Historical exposure: invoices already paid a late fee computed from the
  // UTC-shifted issue date. Reported only — never rewritten here.
  const overcharged = await db.execute(sql`
    SELECT ri.invoice_number, c.full_name, ri.status, ri.rent_paise, ri.paid_late_fee_paise
    FROM rent_invoices ri
    JOIN bookings b ON b.id = ri.booking_id
    JOIN customers c ON c.id = b.customer_id
    WHERE (ri.created_at AT TIME ZONE 'UTC')::date
        <> (ri.created_at AT TIME ZONE 'Asia/Kolkata')::date
      AND COALESCE(ri.paid_late_fee_paise, 0) > 0
    ORDER BY ri.created_at
  `);

  console.log('\nHistorical over-charge (one extra grace day already collected):');
  let totalOver = 0;
  for (const r of overcharged as unknown as Record<string, string>[]) {
    const overPaise = Math.floor(Number(r.rent_paise) / 100); // exactly one extra 1% day
    totalOver += overPaise;
    console.log(
      `  ${r.invoice_number}  ${r.full_name}  [${r.status}]  ` +
        `collected=${paiseToInr(Number(r.paid_late_fee_paise))}  over=${paiseToInr(overPaise)}`,
    );
  }
  console.log(`  residents affected: ${overcharged.length}`);
  console.log(`  total over-collected: ${paiseToInr(totalOver)}`);

  // Canonical projection with the shipped engine — what every surface renders.
  const { projectInvoice, rentInvoiceIssueDate } = await import('@/src/services/rentInvoices');
  const invoices = await db
    .select()
    .from(rentInvoices)
    .where(sql`${rentInvoices.billingMonth} = '2026-09-01'::date`);

  console.log('\nCanonical projectInvoice() as of ' + TODAY + ':');
  for (const inv of invoices) {
    if (inv.status === 'cancelled' || inv.status === 'expired') continue;
    const view = projectInvoice(inv, TODAY);
    console.log(
      `  ${inv.invoiceNumber}  issue=${rentInvoiceIssueDate(inv)}  grace_end=${view.graceEndDate ?? '-'}  ` +
        `${view.lateFeePercent ?? 0}%  late_fee=${paiseToInr(view.accruedLateFeePaise)}  [${view.effectiveStatus}]`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });

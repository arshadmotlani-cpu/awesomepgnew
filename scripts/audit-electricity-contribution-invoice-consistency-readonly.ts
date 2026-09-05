#!/usr/bin/env npx tsx
/**
 * READ-ONLY fleet cert: checkout electricity contributions vs resident invoices.
 * Mutation count: 0
 *
 * Finds:
 *   - checkout_settlement ledger rows without matching electricity_room_contributions
 *   - contributors with non-zero unpaid active electricity invoices for same room/month
 *
 * Usage: npm run cert:electricity-contribution-invoice-readonly
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('audit-electricity-contribution-invoice');

import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';

type Finding = {
  issue: string;
  affected_count: number;
  severity: 'fail' | 'warn';
};

const FAIL_ISSUES = new Set([
  'checkout_ledger_missing_contribution',
  'contributor_nonzero_unpaid_invoice',
]);

async function main(): Promise<void> {
  console.log('Electricity contribution / invoice consistency (read-only)\n');

  const findings: Finding[] = [];

  const ledgerMissing = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count
    FROM electricity_settlement_ledger esl
    WHERE esl.amount_paise > 0
      AND NOT EXISTS (
        SELECT 1 FROM electricity_room_contributions erc
        WHERE erc.checkout_settlement_id = esl.checkout_settlement_id
      )
  `);
  findings.push({
    issue: 'checkout_ledger_missing_contribution',
    affected_count: Number(ledgerMissing[0]?.count ?? 0),
    severity: 'fail',
  });

  const contributorInvoiced = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count
    FROM electricity_room_contributions erc
    INNER JOIN electricity_invoices ei
      ON ei.customer_id = erc.customer_id
      AND ei.room_id = erc.room_id
      AND ei.billing_month = erc.billing_month
    WHERE erc.amount_paise > 0
      AND ei.status NOT IN ('cancelled', 'paid')
      AND ei.amount_paise > 0
      AND ei.is_pipeline_test = false
      AND (ei.paid_paise IS NULL OR ei.paid_paise < ei.amount_paise)
  `);
  findings.push({
    issue: 'contributor_nonzero_unpaid_invoice',
    affected_count: Number(contributorInvoiced[0]?.count ?? 0),
    severity: 'fail',
  });

  const settlementNoContribution = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count
    FROM checkout_settlements cs
    INNER JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
    WHERE cs.electricity_share_paise > 0
      AND cs.status IN ('approved', 'refund_pending', 'completed', 'refund_paid')
      AND NOT EXISTS (
        SELECT 1 FROM electricity_room_contributions erc
        WHERE erc.checkout_settlement_id = cs.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM electricity_settlement_ledger esl
        WHERE esl.checkout_settlement_id = cs.id AND esl.amount_paise > 0
      )
  `);
  findings.push({
    issue: 'approved_settlement_electricity_without_collection_record',
    affected_count: Number(settlementNoContribution[0]?.count ?? 0),
    severity: 'warn',
  });

  let failCount = 0;
  for (const row of findings) {
    const label = row.severity === 'fail' ? 'FAIL' : 'WARN';
    console.log(`[${label}] ${row.issue}: ${row.affected_count}`);
    if (FAIL_ISSUES.has(row.issue) && row.affected_count > 0) failCount += 1;
  }

  await closeDb();
  if (failCount > 0) {
    console.error(`\n${failCount} engine invariant(s) failed.`);
    process.exit(1);
  }
  console.log('\nPASS — no contribution/invoice consistency failures.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

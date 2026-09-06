#!/usr/bin/env npx tsx
/**
 * Generic backfill: deposit-proven checkout electricity → ledger + contributions.
 * Only rows with matching deposit_ledger "Electricity share at checkout" deduction.
 *
 * Preview (default):
 *   npx tsx scripts/backfill-electricity-contributions-from-deposit-evidence.ts
 *
 * Execute:
 *   CONFIRM_ELECTRICITY_DEPOSIT_EVIDENCE_BACKFILL=1 npx tsx scripts/backfill-electricity-contributions-from-deposit-evidence.ts --execute
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('backfill-electricity-deposit-evidence');

import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { checkoutSettlements } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { recordCheckoutElectricityCollectionInTx } from '@/src/services/roomElectricityLedger';

const execute = process.argv.includes('--execute');
const DEPOSIT_ELECTRICITY_REASON = 'Electricity share at checkout';

const CHECKOUT_COLLECTION_STATUSES = [
  'awaiting_admin_review',
  'approved',
  'refund_pending',
  'completed',
  'refund_paid',
] as const;

type CandidateRow = {
  checkout_settlement_id: string;
  customer_id: string;
  customer_name: string;
  booking_id: string;
  room_id: string;
  room_number: string;
  billing_month: string;
  amount_paise: number;
  vacating_date: string;
};

async function listCandidates(): Promise<CandidateRow[]> {
  return db.execute<CandidateRow>(sql`
    SELECT
      cs.id::text AS checkout_settlement_id,
      cs.customer_id::text,
      c.full_name AS customer_name,
      cs.booking_id::text,
      b.room_id::text AS room_id,
      r.room_number,
      date_trunc('month', vr.vacating_date::timestamp)::date::text AS billing_month,
      cs.electricity_from_deposit_paise::int AS amount_paise,
      vr.vacating_date::text AS vacating_date
    FROM checkout_settlements cs
    INNER JOIN customers c ON c.id = cs.customer_id
    INNER JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
    INNER JOIN bed_reservations br ON br.booking_id = cs.booking_id AND br.kind = 'primary'
    INNER JOIN beds b ON b.id = br.bed_id
    INNER JOIN rooms r ON r.id = b.room_id
    WHERE cs.electricity_from_deposit_paise > 0
      AND cs.electricity_deduct_from_deposit = true
      AND cs.status IN (${sql.join(
        CHECKOUT_COLLECTION_STATUSES.map((s) => sql`${s}`),
        sql`, `,
      )})
      AND EXISTS (
        SELECT 1 FROM deposit_ledger dl
        WHERE dl.booking_id = cs.booking_id
          AND dl.entry_kind = 'deducted'
          AND dl.reason = ${DEPOSIT_ELECTRICITY_REASON}
          AND abs(dl.amount_paise) = cs.electricity_from_deposit_paise
      )
      AND NOT EXISTS (
        SELECT 1 FROM electricity_room_contributions erc
        WHERE erc.checkout_settlement_id = cs.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM electricity_settlement_ledger esl
        WHERE esl.checkout_settlement_id = cs.id AND esl.amount_paise > 0
      )
    ORDER BY billing_month, r.room_number, c.full_name
  `);
}

async function main(): Promise<void> {
  const candidates = await listCandidates();

  console.log(`Deposit-evidence backfill candidates: ${candidates.length}`);
  let skipped = 0;
  for (const row of candidates) {
    const [settlement] = await db
      .select()
      .from(checkoutSettlements)
      .where(eq(checkoutSettlements.id, row.checkout_settlement_id))
      .limit(1);
    if (!settlement) {
      skipped += 1;
      console.log(`  SKIP settlement=${row.checkout_settlement_id} — settlement row missing`);
      continue;
    }
    console.log(
      `  CANDIDATE settlement=${row.checkout_settlement_id} room=${row.room_number} ` +
        `month=${row.billing_month} amount=${row.amount_paise} resident=${row.customer_name} ` +
        `evidence=deposit_ledger:"${DEPOSIT_ELECTRICITY_REASON}"`,
    );
  }

  if (!execute) {
    console.log(`\nDry run — ${candidates.length} candidate(s), ${skipped} skipped.`);
    console.log(
      'Pass --execute with CONFIRM_ELECTRICITY_DEPOSIT_EVIDENCE_BACKFILL=1 to apply.',
    );
    await closeDb();
    return;
  }

  if (process.env.CONFIRM_ELECTRICITY_DEPOSIT_EVIDENCE_BACKFILL !== '1') {
    throw new Error('Set CONFIRM_ELECTRICITY_DEPOSIT_EVIDENCE_BACKFILL=1 to execute backfill.');
  }

  let inserted = 0;
  for (const row of candidates) {
    const [settlement] = await db
      .select()
      .from(checkoutSettlements)
      .where(eq(checkoutSettlements.id, row.checkout_settlement_id))
      .limit(1);
    if (!settlement) continue;

    await db.transaction(async (tx) => {
      await recordCheckoutElectricityCollectionInTx(tx, {
        settlement,
        vacatingDate: row.vacating_date,
        roomId: row.room_id,
      });
    });
    inserted += 1;
  }

  console.log(`\nBackfilled ${inserted} deposit-evidence collection(s). Duplicates prevented by checkout_settlement_id unique indexes.`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

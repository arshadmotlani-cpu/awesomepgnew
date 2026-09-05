#!/usr/bin/env npx tsx
/**
 * Generic backfill: electricity_settlement_ledger → electricity_room_contributions
 * when contribution rows are missing (idempotent).
 *
 * Preview (default):
 *   npx tsx scripts/backfill-electricity-contributions-from-ledger.ts
 *
 * Execute:
 *   CONFIRM_ELECTRICITY_CONTRIBUTION_BACKFILL=1 npx tsx scripts/backfill-electricity-contributions-from-ledger.ts --execute
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('backfill-electricity-contributions');

import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { recordCheckoutElectricityContributionInTx } from '@/src/services/electricityRoomContributions';

const execute = process.argv.includes('--execute');

type MissingRow = {
  checkout_settlement_id: string;
  room_id: string;
  billing_month: string;
  customer_id: string;
  booking_id: string;
  amount_paise: number;
  vacating_date: string;
};

async function main(): Promise<void> {
  const rows = await db.execute<MissingRow>(sql`
    SELECT
      esl.checkout_settlement_id,
      esl.room_id::text,
      esl.billing_month::text,
      esl.customer_id::text,
      esl.booking_id::text,
      esl.amount_paise::int AS amount_paise,
      vr.vacating_date::text AS vacating_date
    FROM electricity_settlement_ledger esl
    INNER JOIN checkout_settlements cs ON cs.id = esl.checkout_settlement_id
    INNER JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
    WHERE esl.amount_paise > 0
      AND NOT EXISTS (
        SELECT 1 FROM electricity_room_contributions erc
        WHERE erc.checkout_settlement_id = esl.checkout_settlement_id
      )
    ORDER BY esl.billing_month, esl.room_id
  `);

  console.log(`Missing contribution rows: ${rows.length}`);
  for (const row of rows.slice(0, 20)) {
    console.log(
      `  settlement=${row.checkout_settlement_id} room=${row.room_id} month=${row.billing_month} amount=${row.amount_paise}`,
    );
  }
  if (rows.length > 20) console.log(`  ... and ${rows.length - 20} more`);

  if (!execute) {
    console.log('\nDry run — pass --execute with CONFIRM_ELECTRICITY_CONTRIBUTION_BACKFILL=1 to apply.');
    await closeDb();
    return;
  }

  if (process.env.CONFIRM_ELECTRICITY_CONTRIBUTION_BACKFILL !== '1') {
    throw new Error('Set CONFIRM_ELECTRICITY_CONTRIBUTION_BACKFILL=1 to execute backfill.');
  }

  let inserted = 0;
  for (const row of rows) {
    await db.transaction(async (tx) => {
      await recordCheckoutElectricityContributionInTx(tx, {
        roomId: row.room_id,
        billingMonth: row.billing_month,
        customerId: row.customer_id,
        bookingId: row.booking_id,
        amountPaise: row.amount_paise,
        checkoutSettlementId: row.checkout_settlement_id,
        contributionDate: row.vacating_date,
        reason: 'Backfilled from electricity_settlement_ledger',
      });
    });
    inserted += 1;
  }

  console.log(`\nBackfilled ${inserted} contribution row(s).`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

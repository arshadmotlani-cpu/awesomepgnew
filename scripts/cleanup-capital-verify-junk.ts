/**
 * Reverse deploy-verification manual profits left on invest DB.
 * Usage: npx tsx scripts/cleanup-capital-verify-junk.ts
 */
import { loadAppEnv } from '../src/lib/db/loadEnv';
loadAppEnv();

import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { createCapitalClient } from '../src/capital/db/client';
import { acManualProfits } from '../src/capital/db/schema';
import { reverseSourceLedger } from '../src/capital/services/ledger';

async function main() {
  const { db, close } = createCapitalClient({ max: 1 });

  const rows = await db
    .select()
    .from(acManualProfits)
    .where(
      and(
        eq(acManualProfits.isReversed, false),
        or(
          ilike(acManualProfits.source, '%Deploy verification%'),
          ilike(acManualProfits.description, '%Deploy verify%'),
          and(eq(acManualProfits.amountPaise, 100), ilike(acManualProfits.source, '%verif%')),
        ),
      ),
    );

  console.log(`Found ${rows.length} verification manual profit(s) to reverse`);

  for (const row of rows) {
    await db.transaction(async (tx) => {
      await tx
        .update(acManualProfits)
        .set({ isReversed: true, updatedAt: new Date() })
        .where(eq(acManualProfits.id, row.id));
      await reverseSourceLedger(
        'ac_manual_profits',
        row.id,
        'Cleanup: reverse deploy verification junk',
        tx,
        'manual_profit',
      );
    });
    console.log(`  reversed ${row.id} — ₹${row.amountPaise / 100} — ${row.source}`);
  }

  // Also reverse any leftover ₹1 (100 paise) "Deploy verification" already caught above;
  // catch bare ₹1 rows with empty-ish verification notes
  const tiny = await db
    .select()
    .from(acManualProfits)
    .where(
      and(
        eq(acManualProfits.isReversed, false),
        eq(acManualProfits.amountPaise, 100),
        sql`${acManualProfits.description} ILIKE 'Deploy verify%'`,
      ),
    );
  for (const row of tiny) {
    await db.transaction(async (tx) => {
      await tx
        .update(acManualProfits)
        .set({ isReversed: true, updatedAt: new Date() })
        .where(eq(acManualProfits.id, row.id));
      await reverseSourceLedger(
        'ac_manual_profits',
        row.id,
        'Cleanup: reverse deploy verification junk',
        tx,
        'manual_profit',
      );
    });
    console.log(`  reversed tiny ${row.id}`);
  }

  await close();
  console.log('✓ Cleanup complete');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

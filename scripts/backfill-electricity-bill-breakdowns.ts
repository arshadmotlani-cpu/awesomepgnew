/**
 * Backfill calculation_breakdown for existing electricity bills (on-read SSOT rebuild).
 *
 *   DATABASE_URL='…' npx tsx scripts/backfill-electricity-bill-breakdowns.ts
 */
import 'dotenv/config';
import { eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { electricityBills } from '@/src/db/schema';
import { loadElectricityBillBreakdown } from '@/src/lib/billing/buildElectricityBillBreakdown';

async function main() {
  const bills = await db
    .select({ id: electricityBills.id, roomNumber: sql<string>`(SELECT room_number FROM rooms WHERE id = ${electricityBills.roomId})` })
    .from(electricityBills)
    .where(
      or(
        isNull(electricityBills.calculationBreakdown),
        sql`${electricityBills.calculationBreakdown} = 'null'::jsonb`,
      ),
    );

  console.log(`Backfilling ${bills.length} electricity bill(s)…`);
  let updated = 0;
  for (const bill of bills) {
    const breakdown = await loadElectricityBillBreakdown(bill.id);
    if (!breakdown) continue;
    await db
      .update(electricityBills)
      .set({ calculationBreakdown: breakdown, updatedAt: new Date() })
      .where(eq(electricityBills.id, bill.id));
    updated += 1;
    console.log(`  ✓ Room ${bill.roomNumber} — ${bill.id}`);
  }
  console.log(`Done. Updated ${updated} bill(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

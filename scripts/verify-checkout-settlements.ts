/**
 * Verify checkout_settlements + find Harish
 * Usage: npx tsx scripts/verify-checkout-settlements.ts
 */
import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local' });
config({ path: '.env.production.local' });

import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';

async function main() {
  const tableCheck = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'checkout_settlements'
    ) AS exists
  `);
  console.log('checkout_settlements table exists:', tableCheck[0]?.exists);

  const counts = await db.execute(sql`
    SELECT status, count(*)::int AS n
    FROM checkout_settlements
    GROUP BY status
    ORDER BY status
  `);
  console.log('\nSettlement counts by status:', counts);

  const harishCustomers = await db.execute(sql`
    SELECT id, full_name, phone FROM customers
    WHERE full_name ILIKE '%harish%'
  `);
  console.log('\nCustomers named Harish:', harishCustomers);

  const harishSettlements = await db.execute(sql`
    SELECT cs.id, cs.status, c.full_name, vr.vacating_date, vr.status AS vacating_status
    FROM checkout_settlements cs
    INNER JOIN customers c ON c.id = cs.customer_id
    INNER JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
    WHERE c.full_name ILIKE '%harish%'
  `);
  console.log('\nHarish checkout settlements:', harishSettlements);

  const missingBackfill = await db.execute(sql`
    SELECT vr.id AS vacating_request_id, vr.status, c.full_name, vr.vacating_date
    FROM vacating_requests vr
    INNER JOIN customers c ON c.id = vr.customer_id
    LEFT JOIN checkout_settlements cs ON cs.vacating_request_id = vr.id
    WHERE vr.status IN ('approved', 'completed')
      AND cs.id IS NULL
    ORDER BY vr.created_at DESC
  `);
  console.log('\nApproved/completed vacating WITHOUT checkout_settlement:', missingBackfill);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Read-only: audit bed_prices for Room 101 B1 (APG-2026-0021 destination).
 * Does not mutate. Run ensure-bed-price-sep-7600.ts after audit to add Sep 1 price.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
import { loadBedPrice } from '@/src/services/pricing';

loadProductionAuditEnv();
requireDatabaseUrl();

const BOOKING_CODE = 'APG-2026-0021';

async function main() {
  const [ctx] = await db.execute<{
    to_bed_id: string;
    room_number: string;
    bed_code: string;
  }>(sql`
    SELECT rcr.to_bed_id::text, tr.room_number, tb.bed_code
    FROM room_change_requests rcr
    JOIN bookings b ON b.id = rcr.booking_id
    JOIN beds tb ON tb.id = rcr.to_bed_id
    JOIN rooms tr ON tr.id = tb.room_id
    WHERE b.booking_code = ${BOOKING_CODE}
    ORDER BY rcr.created_at DESC
    LIMIT 1
  `);
  if (!ctx) throw new Error('No room change request found');

  const prices = await db.execute(sql`
    SELECT id::text, monthly_rate_paise::bigint::int, effective_from::text, effective_to::text
    FROM bed_prices
    WHERE bed_id = ${ctx.to_bed_id}::uuid
    ORDER BY effective_from
  `);

  const aug31 = await loadBedPrice(ctx.to_bed_id, '2026-08-31');
  const sep1 = await loadBedPrice(ctx.to_bed_id, '2026-09-01');

  console.log(
    JSON.stringify(
      {
        destination: ctx,
        bedPrices: prices,
        loadBedPriceAug31: aug31?.monthlyRatePaise ?? null,
        loadBedPriceSep1: sep1?.monthlyRatePaise ?? null,
        expectedSep1Paise: 760_000,
      },
      null,
      2,
    ),
  );
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});

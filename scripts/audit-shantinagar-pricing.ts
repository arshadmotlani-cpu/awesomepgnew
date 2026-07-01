/**
 * Audit SHANTINAGAR bed pricing — what was actually updated in production.
 * Usage: npx tsx scripts/audit-shantinagar-pricing.ts
 */
import 'dotenv/config';
import { config } from 'dotenv';
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { paiseToInr } from '@/src/lib/format';

config({ path: '.env.local' });

async function main() {
  const pgRows = await db.execute(sql`
    SELECT id, name, slug FROM pgs WHERE name ILIKE '%shantinagar%' OR slug ILIKE '%shantinagar%'
  `);
  const pg = (pgRows.rows as { id: string; name: string; slug: string }[])[0];
  if (!pg) {
    console.error('SHANTINAGAR PG not found');
    process.exit(1);
  }

  console.log(`PG: ${pg.name} (${pg.id})\n`);

  const revisions = await db.execute(sql`
    SELECT id, rent_percent_change, deposit_percent_change, beds_affected,
           old_avg_rent_paise, new_avg_rent_paise, reason, bed_changes, created_at
    FROM pg_price_revisions
    WHERE pg_id = ${pg.id}::uuid
    ORDER BY created_at DESC
    LIMIT 10
  `);

  console.log('=== Recent pg_price_revisions ===');
  for (const r of revisions.rows as Record<string, unknown>[]) {
    console.log(JSON.stringify({
      at: r.created_at,
      rentPct: r.rent_percent_change,
      bedsAffected: r.beds_affected,
      oldAvg: paiseToInr(Number(r.old_avg_rent_paise)),
      newAvg: paiseToInr(Number(r.new_avg_rent_paise)),
      reason: r.reason,
      bedChangeCount: Array.isArray(r.bed_changes) ? (r.bed_changes as unknown[]).length : 0,
    }));
  }

  const beds = await db.execute(sql`
    SELECT
      r.room_number,
      b.bed_code,
      b.id AS bed_id,
      bp.monthly_rate_paise,
      bp.effective_from,
      bp.created_at AS price_created_at
    FROM beds b
    JOIN rooms r ON r.id = b.room_id
    JOIN floors f ON f.id = r.floor_id
    WHERE f.pg_id = ${pg.id}::uuid
      AND b.deleted_at IS NULL
      AND r.deleted_at IS NULL
    ORDER BY r.room_number, b.bed_code
  `);

  const bedRows = beds.rows as {
    room_number: string;
    bed_code: string;
    bed_id: string;
    monthly_rate_paise: string | number;
    effective_from: string;
    price_created_at: string;
  }[];

  const currentPrices = await db.execute(sql`
    SELECT DISTINCT ON (bp.bed_id)
      bp.bed_id,
      bp.monthly_rate_paise,
      bp.effective_from,
      bp.created_at
    FROM bed_prices bp
    JOIN beds b ON b.id = bp.bed_id
    JOIN rooms r ON r.id = b.room_id
    JOIN floors f ON f.id = r.floor_id
    WHERE f.pg_id = ${pg.id}::uuid
      AND (bp.effective_to IS NULL OR bp.effective_to > CURRENT_DATE)
    ORDER BY bp.bed_id, bp.effective_from DESC, bp.created_at DESC
  `);

  const priceByBed = new Map(
    (currentPrices.rows as { bed_id: string; monthly_rate_paise: number; effective_from: string; created_at: string }[]).map(
      (p) => [p.bed_id, p],
    ),
  );

  const byRoom = new Map<string, { beds: number; monthlies: number[]; effectiveDates: Set<string> }>();
  for (const bed of bedRows) {
    const price = priceByBed.get(bed.bed_id);
    const monthly = Number(price?.monthly_rate_paise ?? bed.monthly_rate_paise);
    const room = bed.room_number;
    if (!byRoom.has(room)) {
      byRoom.set(room, { beds: 0, monthlies: [], effectiveDates: new Set() });
    }
    const entry = byRoom.get(room)!;
    entry.beds += 1;
    if (monthly > 0) entry.monthlies.push(monthly);
    if (price?.effective_from) entry.effectiveDates.add(String(price.effective_from).slice(0, 10));
  }

  const allMonthlies = [...byRoom.values()].flatMap((r) => r.monthlies);
  const avgMonthly =
    allMonthlies.length > 0
      ? Math.round(allMonthlies.reduce((s, m) => s + m, 0) / allMonthlies.length)
      : 0;

  const uniqueMonthlies = [...new Set(allMonthlies)].sort((a, b) => a - b);
  const today = new Date().toISOString().slice(0, 10);

  const roomsUpdatedToday: string[] = [];
  const roomsNotUpdatedToday: string[] = [];
  for (const [roomNum, data] of [...byRoom.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { numeric: true }),
  )) {
    const hasToday = [...data.effectiveDates].some((d) => d.startsWith(today.slice(0, 7)) || d === today);
    const roomMonthlies = [...new Set(data.monthlies)];
    const consistent = roomMonthlies.length === 1;
    const line = `Room ${roomNum}: ${data.beds} beds, monthly=${roomMonthlies.map(paiseToInr).join(' / ')}, effective=${[...data.effectiveDates].join(',')}${consistent ? '' : ' **INCONSISTENT**'}`;
    console.log(line);
    if (hasToday || data.effectiveDates.size > 0) {
      const latest = [...data.effectiveDates].sort().pop();
      if (latest && latest >= `${today.slice(0, 7)}-01`) roomsUpdatedToday.push(roomNum);
      else roomsNotUpdatedToday.push(roomNum);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total rooms: ${byRoom.size}`);
  console.log(`Total beds: ${bedRows.length}`);
  console.log(`Average monthly rent (current): ${paiseToInr(avgMonthly)}`);
  console.log(`Distinct monthly rates across PG: ${uniqueMonthlies.map(paiseToInr).join(', ')}`);

  const todayPriceVersions = await db.execute(sql`
    SELECT COUNT(DISTINCT bp.bed_id) AS beds_with_today_version
    FROM bed_prices bp
    JOIN beds b ON b.id = bp.bed_id
    JOIN rooms r ON r.id = b.room_id
    JOIN floors f ON f.id = r.floor_id
    WHERE f.pg_id = ${pg.id}::uuid
      AND bp.created_at::date = CURRENT_DATE
  `);
  console.log(`Beds with bed_prices row created today: ${(todayPriceVersions.rows[0] as { beds_with_today_version: string }).beds_with_today_version}`);

  const bedsWithJuneEffective = await db.execute(sql`
    SELECT COUNT(DISTINCT bp.bed_id) AS cnt
    FROM bed_prices bp
    JOIN beds b ON b.id = bp.bed_id
    JOIN rooms r ON r.id = b.room_id
    JOIN floors f ON f.id = r.floor_id
    WHERE f.pg_id = ${pg.id}::uuid
      AND bp.effective_from >= date_trunc('month', CURRENT_DATE)::date
      AND (bp.effective_to IS NULL OR bp.effective_to > CURRENT_DATE)
  `);
  console.log(`Beds with current-month effective price: ${(bedsWithJuneEffective.rows[0] as { cnt: string }).cnt}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Read-only Room 102 scheduled room configuration (production).
 * Mutations: 0
 *
 * USE_PRODUCTION_DB=1 npx tsx scripts/audit-room-102-scheduled-configuration-readonly.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('audit-room-102-scheduled-config');

import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { paiseToInr } from '@/src/lib/format';

function rows<T extends Record<string, unknown>>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: T[] })?.rows ?? []) as T[];
}

async function main() {
  const room = rows<{ room_id: string; room_number: string }>(
    await db.execute(sql`
      SELECT r.id::text AS room_id, r.room_number
      FROM rooms r
      JOIN floors f ON f.id = r.floor_id
      JOIN pgs p ON p.id = f.pg_id
      WHERE r.room_number = '102' AND p.name ILIKE '%shantinagar%'
      LIMIT 1
    `),
  )[0];
  if (!room) throw new Error('Room 102 Shantinagar not found');

  const beds = rows<Record<string, unknown>>(
    await db.execute(sql`
      SELECT b.bed_code, b.id::text AS bed_id,
             (SELECT count(*)::int FROM bed_reservations br
              WHERE br.bed_id = b.id AND br.status = 'active' AND br.kind = 'primary'
                AND CURRENT_DATE <@ br.stay_range) AS active_residents
      FROM beds b
      WHERE b.room_id = ${room.room_id}::uuid AND b.archived_at IS NULL
      ORDER BY b.bed_code
    `),
  );

  const currentPrice = rows<Record<string, unknown>>(
    await db.execute(sql`
      SELECT bp.monthly_rate_paise, bp.weekly_rate_paise, bp.daily_rate_paise,
             bp.monthly_security_deposit_paise, bp.effective_from::text
      FROM bed_prices bp
      JOIN beds b ON b.id = bp.bed_id
      WHERE b.room_id = ${room.room_id}::uuid
        AND bp.effective_from <= CURRENT_DATE
        AND (bp.effective_to IS NULL OR bp.effective_to > CURRENT_DATE)
      ORDER BY b.bed_code, bp.effective_from DESC
      LIMIT 1
    `),
  )[0];

  const schedules = rows<Record<string, unknown>>(
    await db.execute(sql`
      SELECT id::text, status::text, effective_from::text,
             target_bed_count, room_type_name,
             daily_rate_paise, weekly_rate_paise, monthly_rate_paise,
             daily_deposit_paise, weekly_deposit_paise, monthly_deposit_paise,
             previous_snapshot, created_at::text
      FROM room_configuration_schedules
      WHERE room_id = ${room.room_id}::uuid
      ORDER BY effective_from
    `),
  );

  const futureBedPrices = rows<Record<string, unknown>>(
    await db.execute(sql`
      SELECT b.bed_code, bp.effective_from::text, bp.effective_to::text,
             bp.monthly_rate_paise, bp.weekly_rate_paise, bp.daily_rate_paise
      FROM bed_prices bp
      JOIN beds b ON b.id = bp.bed_id
      WHERE b.room_id = ${room.room_id}::uuid
        AND bp.effective_from >= '2026-10-01'::date
      ORDER BY bp.effective_from, b.bed_code
    `),
  );

  console.log(
    JSON.stringify(
      {
        mutations: 0,
        room,
        currentActiveBeds: beds.length,
        beds,
        currentCatalogPrice: currentPrice
          ? {
              monthlyInr: paiseToInr(Number(currentPrice.monthly_rate_paise)),
              weeklyInr: paiseToInr(Number(currentPrice.weekly_rate_paise)),
              dailyInr: paiseToInr(Number(currentPrice.daily_rate_paise)),
              depositInr: paiseToInr(Number(currentPrice.monthly_security_deposit_paise)),
              effectiveFrom: currentPrice.effective_from,
            }
          : null,
        configurationSchedules: schedules.map((s) => ({
          ...s,
          monthlyInr: paiseToInr(Number(s.monthly_rate_paise)),
          weeklyInr: paiseToInr(Number(s.weekly_rate_paise)),
          dailyInr: paiseToInr(Number(s.daily_rate_paise)),
          depositInr: paiseToInr(Number(s.monthly_deposit_paise)),
        })),
        futureBedPricesFromOct: futureBedPrices.map((p) => ({
          bed: p.bed_code,
          effectiveFrom: p.effective_from,
          monthlyInr: paiseToInr(Number(p.monthly_rate_paise)),
          weeklyInr: paiseToInr(Number(p.weekly_rate_paise)),
          dailyInr: paiseToInr(Number(p.daily_rate_paise)),
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

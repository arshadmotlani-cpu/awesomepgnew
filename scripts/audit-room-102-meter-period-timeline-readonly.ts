/**
 * Read-only Room 102 meter-period timeline (production).
 * Mutations: 0
 *
 * USE_PRODUCTION_DB=1 npx tsx scripts/audit-room-102-meter-period-timeline-readonly.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('audit-room-102-meter-timeline');

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
  if (!room) throw new Error('Room 102 not found');

  const bills = rows<Record<string, unknown>>(
    await db.execute(sql`
      SELECT eb.billing_month::text,
             eb.period_start_date::text,
             eb.period_end_date::text,
             eb.previous_reading_units::text AS opening,
             eb.current_reading_units::text AS closing,
             eb.units_consumed::text AS units,
             eb.total_paise,
             eb.rate_per_unit_paise,
             eb.bill_status::text,
             eb.created_at::text AS generated_at
      FROM electricity_bills eb
      WHERE eb.room_id = ${room.room_id}::uuid
        AND eb.is_pipeline_test = false
      ORDER BY eb.created_at ASC
    `),
  );

  const timeline = bills.map((b) => ({
    reportingMonth: b.billing_month,
    periodStart: b.period_start_date ?? '(not stored — use meter logs / breakdown)',
    periodEnd: b.period_end_date ?? '(not stored)',
    opening: b.opening,
    closing: b.closing,
    units: b.units,
    grossInr: paiseToInr(Number(b.total_paise)),
    ratePerUnitInr: paiseToInr(Number(b.rate_per_unit_paise)),
    generatedAt: b.generated_at,
    finalized: b.bill_status,
  }));

  console.log(
    JSON.stringify(
      {
        mutations: 0,
        roomNumber: room.room_number,
        note:
          'Meter period identity is opening→closing units; billing_month is reporting only.',
        timeline,
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

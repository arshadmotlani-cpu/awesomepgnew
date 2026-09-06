/**
 * Read-only: diagnose Room 102 Sep occupancy interval corruption.
 * Mutations: 0
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('audit-room-102-occ-bounds');

import { writeFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';

async function main() {
  const cols = await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'room_change_requests'
    ORDER BY ordinal_position
  `);

  const saswatChanges = await db.execute(sql`
    SELECT rcr.*
    FROM room_change_requests rcr
    JOIN bookings bk ON bk.id = rcr.booking_id
    WHERE bk.booking_code = 'APG-2026-0094'
    ORDER BY rcr.created_at
  `);

  // Who closed Saswat's stay_range upper bound?
  const audit = await db.execute(sql`
    SELECT id::text, action, entity_type, entity_id::text, actor_id::text,
           payload, created_at::text
    FROM audit_logs
    WHERE entity_id = '0396b0ea-e377-498b-bf8b-2c97a81134e7'::uuid
       OR (payload::text ILIKE '%0396b0ea-e377-498b-bf8b-2c97a81134e7%')
       OR (payload::text ILIKE '%APG-2026-0094%' AND created_at >= '2026-09-01')
    ORDER BY created_at DESC
    LIMIT 40
  `).catch((e) => ({ error: String(e.message ?? e) }));

  // Vacating for room 102 residents
  const vacating = await db.execute(sql`
    SELECT vr.id::text, vr.status::text, vr.requested_move_out_date::text,
           vr.actual_move_out_date::text, vr.created_at::text,
           bk.booking_code, c.full_name
    FROM vacating_requests vr
    JOIN bookings bk ON bk.id = vr.booking_id
    JOIN customers c ON c.id = bk.customer_id
    WHERE bk.booking_code IN ('APG-2026-0094','APG-2026-0048','APG-2026-0045','APG-2026-0040','APG-2026-0092')
    ORDER BY vr.created_at
  `).catch((e) => ({ error: String(e.message ?? e) }));

  // All reservations for Krishna/Kunal (completed with null end?)
  const former = await db.execute(sql`
    SELECT c.full_name, bk.booking_code, bk.status::text AS booking_status,
           b.bed_code, r.room_number, br.status::text AS res_status,
           lower(br.stay_range)::text AS stay_start,
           upper(br.stay_range)::text AS stay_end_excl,
           br.updated_at::text
    FROM bed_reservations br
    JOIN beds b ON b.id = br.bed_id
    JOIN rooms r ON r.id = b.room_id
    JOIN bookings bk ON bk.id = br.booking_id
    JOIN customers c ON c.id = bk.customer_id
    WHERE bk.booking_code IN ('APG-2026-0048','APG-2026-0045')
      AND br.kind = 'primary'
    ORDER BY c.full_name, lower(br.stay_range)
  `);

  // Check if open-ended completed is fleet-wide
  const openCompleted = await db.execute(sql`
    SELECT count(*)::int AS cnt
    FROM bed_reservations br
    JOIN bookings bk ON bk.id = br.booking_id
    WHERE br.kind = 'primary'
      AND br.status = 'completed'
      AND upper(br.stay_range) IS NULL
      AND bk.is_test = false
  `);

  // Active with finite end in future/past relative to today
  const activeFinite = await db.execute(sql`
    SELECT c.full_name, bk.booking_code, r.room_number, b.bed_code,
           lower(br.stay_range)::text AS stay_start,
           upper(br.stay_range)::text AS stay_end_excl,
           p.name AS pg_name,
           br.updated_at::text
    FROM bed_reservations br
    JOIN beds b ON b.id = br.bed_id
    JOIN rooms r ON r.id = b.room_id
    JOIN floors f ON f.id = r.floor_id
    JOIN pgs p ON p.id = f.pg_id
    JOIN bookings bk ON bk.id = br.booking_id
    JOIN customers c ON c.id = bk.customer_id
    WHERE br.kind = 'primary'
      AND br.status = 'active'
      AND upper(br.stay_range) IS NOT NULL
      AND bk.is_test = false
      AND bk.status = 'confirmed'
    ORDER BY upper(br.stay_range)
    LIMIT 50
  `);

  const out = {
    mutations: 0,
    roomChangeColumns: cols,
    saswatChanges,
    audit,
    vacating,
    formerKrishnaKunal: former,
    openEndedCompletedCount: openCompleted,
    activeWithFiniteEnd: activeFinite,
  };
  writeFileSync('/tmp/saswat-occ-bounds.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

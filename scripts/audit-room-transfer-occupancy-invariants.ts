/**
 * Read-only platform audit: room-transfer holds vs active allocation vs occupancy SSOT.
 *
 * Usage: npx tsx scripts/audit-room-transfer-occupancy-invariants.ts
 */
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
config({ path: '.env' });
config({ path: '.env.local' });
config({ path: '.env.production.local' });

function ensureDatabaseUrl(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  for (const path of ['.env.prod.live', '.env.production.local', '.env.local', '.env.off']) {
    try {
      const raw = readFileSync(path, 'utf8');
      const match = raw.match(/^DATABASE_URL=(.+)$/m);
      if (match?.[1]?.trim() && !match[1].includes('placeholder')) {
        process.env.DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');
        return;
      }
    } catch {
      // try next file
    }
  }
}

ensureDatabaseUrl();

import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { fetchBedOccupancyRows, resolveBedOccupancyRows } from '../src/services/bedOccupancyBatch';
import { getPgAvailabilitySummaries } from '../src/services/availabilityService';

type TransferRow = {
  request_id: string;
  booking_id: string;
  booking_code: string;
  resident_name: string;
  status: string;
  from_room: string;
  from_bed: string;
  to_room: string;
  to_bed: string;
  from_bed_id: string;
  to_bed_id: string;
  hold_active: boolean;
  current_bed_id: string | null;
  current_room: string | null;
  current_bed: string | null;
};

async function main() {
  const transfers = await db.execute<TransferRow>(sql`
    SELECT
      rcr.id::text AS request_id,
      rcr.booking_id::text AS booking_id,
      bk.booking_code,
      c.full_name AS resident_name,
      rcr.status::text AS status,
      fr.room_number AS from_room,
      fb.bed_code AS from_bed,
      tr.room_number AS to_room,
      tb.bed_code AS to_bed,
      rcr.from_bed_id::text AS from_bed_id,
      rcr.to_bed_id::text AS to_bed_id,
      EXISTS (
        SELECT 1 FROM room_transfer_bed_holds h
        WHERE h.room_change_request_id = rcr.id AND h.status = 'active'
      ) AS hold_active,
      cur.bed_id::text AS current_bed_id,
      cur.room_number AS current_room,
      cur.bed_code AS current_bed
    FROM room_change_requests rcr
    INNER JOIN bookings bk ON bk.id = rcr.booking_id
    INNER JOIN customers c ON c.id = bk.customer_id
    INNER JOIN beds fb ON fb.id = rcr.from_bed_id
    INNER JOIN rooms fr ON fr.id = fb.room_id
    INNER JOIN beds tb ON tb.id = rcr.to_bed_id
    INNER JOIN rooms tr ON tr.id = tb.room_id
    LEFT JOIN LATERAL (
      SELECT bd.id AS bed_id, r.room_number, bd.bed_code
      FROM bed_reservations br
      INNER JOIN beds bd ON bd.id = br.bed_id
      INNER JOIN rooms r ON r.id = bd.room_id
      WHERE br.booking_id = rcr.booking_id
        AND br.kind = 'primary'
        AND br.status = 'active'
        AND CURRENT_DATE <@ br.stay_range
      LIMIT 1
    ) cur ON true
    ORDER BY rcr.created_at DESC
  `);

  console.log(`Room change requests: ${transfers.length}\n`);

  const violations: string[] = [];

  for (const t of transfers) {
    const occupancyRows = await fetchBedOccupancyRows({
      bedId: t.from_bed_id,
    });
    const toRows = await fetchBedOccupancyRows({ bedId: t.to_bed_id });
    const allRows = [...occupancyRows, ...toRows];
    const resolved = resolveBedOccupancyRows(allRows);
    const byBed = new Map(allRows.map((r, i) => [r.bedId, resolved[i]]));

    const oldBed = byBed.get(t.from_bed_id);
    const newBed = byBed.get(t.to_bed_id);

    const oldState = oldBed?.snapshot.publicState ?? 'missing';
    const newState = newBed?.snapshot.publicState ?? 'missing';
    const oldOpen = oldBed?.isOpenNow ?? null;
    const newOpen = newBed?.isOpenNow ?? null;

    console.log(
      [
        t.booking_code,
        t.resident_name,
        `status=${t.status}`,
        `${t.from_room}-${t.from_bed} → ${t.to_room}-${t.to_bed}`,
        `current=${t.current_room ?? '?'} ${t.current_bed ?? '?'}`,
        `hold=${t.hold_active}`,
        `SSOT old=${oldState} open=${oldOpen}`,
        `SSOT new=${newState} open=${newOpen}`,
      ].join(' | '),
    );

    if (t.status === 'completed') {
      if (t.current_bed_id !== t.to_bed_id) {
        violations.push(
          `${t.booking_code}: completed but allocation on ${t.current_room}-${t.current_bed} not ${t.to_room}-${t.to_bed}`,
        );
      }
      if (oldState === 'occupied' || oldOpen) {
        violations.push(`${t.booking_code}: completed but old bed still occupied/open (${oldState})`);
      }
      if (newState !== 'occupied' || newOpen) {
        violations.push(`${t.booking_code}: completed but new bed not occupied (${newState}, open=${newOpen})`);
      }
      if (t.hold_active) {
        violations.push(`${t.booking_code}: completed but transfer hold still active on target`);
      }
    } else if (['submitted', 'waiting', 'approved'].includes(t.status)) {
      if (t.current_bed_id !== t.from_bed_id) {
        violations.push(
          `${t.booking_code}: pending transfer but resident not on source bed (${t.current_room}-${t.current_bed})`,
        );
      }
      if (newOpen) {
        violations.push(`${t.booking_code}: pending transfer but target publicly open (${newState})`);
      }
      if (!t.hold_active && ['submitted', 'waiting', 'approved'].includes(t.status)) {
        violations.push(`${t.booking_code}: pending transfer without active hold on target`);
      }
    }
  }

  const pgRows = await db.execute<{ id: string; slug: string; name: string }>(sql`
    SELECT id::text, slug, name FROM pgs WHERE archived_at IS NULL AND is_active = true
  `);
  const pgIds = pgRows.map((p) => p.id);
  const summaries = await getPgAvailabilitySummaries(pgIds);

  console.log('\n=== PG availability summary (SSOT) ===');
  for (const pg of pgRows) {
    const s = summaries.get(pg.id);
    if (!s) continue;
    const bedRows = await fetchBedOccupancyRows({ pgId: pg.id });
    const resolvedPg = resolveBedOccupancyRows(bedRows);
    const openCount = resolvedPg.filter((r) => r.isOpenNow).length;
    if (openCount !== s.openNowBeds) {
      violations.push(
        `${pg.slug}: PG summary openNowBeds=${s.openNowBeds} but per-bed open count=${openCount}`,
      );
    }
    console.log(
      `${pg.name}: open=${s.openNowBeds} reserved=${s.reservedBeds} occupied=${s.occupiedBeds} (per-bed open=${openCount})`,
    );
  }

  console.log(`\n=== VIOLATIONS: ${violations.length} ===`);
  for (const v of violations) {
    console.log(`- ${v}`);
  }

  if (violations.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

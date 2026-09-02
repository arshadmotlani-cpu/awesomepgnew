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
  workflow_state: string;
  quote_hash: string | null;
  expires_at: Date | null;
  settled_at: Date | null;
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
  open_invoice_count: number;
  paid_paise: number;
  source_electricity_boundary_ok: boolean;
  target_electricity_boundary_ok: boolean;
  terminal_target_reservation_exists: boolean;
};

async function main() {
  const transfers = await db.execute<TransferRow>(sql`
    SELECT
      rcr.id::text AS request_id,
      rcr.booking_id::text AS booking_id,
      bk.booking_code,
      c.full_name AS resident_name,
      rcr.status::text AS status,
      rcr.workflow_state,
      rcr.quote_hash,
      rcr.expires_at,
      rcr.settled_at,
      fr.room_number AS from_room,
      fb.bed_code AS from_bed,
      tr.room_number AS to_room,
      tb.bed_code AS to_bed,
      rcr.from_bed_id::text AS from_bed_id,
      rcr.to_bed_id::text AS to_bed_id,
      EXISTS (
        SELECT 1 FROM room_transfer_bed_holds h
        WHERE h.room_change_request_id = rcr.id
          AND h.status = 'active'
          AND (
            h.expires_at > now()
            OR rcr.workflow_state IN ('READY_TO_TRANSFER', 'TRANSFERRING')
          )
      ) AS hold_active,
      cur.bed_id::text AS current_bed_id,
      cur.room_number AS current_room,
      cur.bed_code AS current_bed,
      (
        SELECT count(*)::int
        FROM financial_invoices fi
        WHERE fi.source_id = rcr.id
          AND fi.status IN ('draft', 'sent', 'payment_in_progress', 'processing', 'partial', 'overdue')
      ) AS open_invoice_count,
      (
        SELECT coalesce(sum(
          CASE
            WHEN fi.source_table = 'room_change_pay_all'
              AND fi.status IN ('paid', 'settled')
            THEN fi.amount_paise
            WHEN fi.source_table <> 'room_change_pay_all'
              AND fi.status IN ('paid', 'settled')
            THEN fi.amount_paise
            ELSE 0
          END
        ), 0)::bigint
        FROM financial_invoices fi
        WHERE fi.source_id = rcr.id
      ) AS paid_paise
      , EXISTS (
        SELECT 1 FROM bed_reservations source_br
        WHERE source_br.booking_id = rcr.booking_id
          AND source_br.bed_id = rcr.from_bed_id
          AND upper(source_br.stay_range) = rcr.expected_transfer_date::date
      ) AS source_electricity_boundary_ok
      , EXISTS (
        SELECT 1 FROM bed_reservations target_br
        WHERE target_br.booking_id = rcr.booking_id
          AND target_br.bed_id = rcr.to_bed_id
          AND lower(target_br.stay_range) = rcr.expected_transfer_date::date
      ) AS target_electricity_boundary_ok
      , EXISTS (
        SELECT 1 FROM bed_reservations target_br
        WHERE target_br.booking_id = rcr.booking_id
          AND target_br.bed_id = rcr.to_bed_id
          AND lower(target_br.stay_range) = rcr.expected_transfer_date::date
          AND target_br.created_at >= rcr.created_at
      ) AS terminal_target_reservation_exists
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
        `status=${t.status}/${t.workflow_state}`,
        `${t.from_room}-${t.from_bed} → ${t.to_room}-${t.to_bed}`,
        `current=${t.current_room ?? '?'} ${t.current_bed ?? '?'}`,
        `hold=${t.hold_active}`,
        `expires=${t.expires_at?.toISOString() ?? '-'}`,
        `settled=${t.settled_at?.toISOString() ?? '-'}`,
        `openInvoices=${t.open_invoice_count}`,
        `SSOT old=${oldState} open=${oldOpen}`,
        `SSOT new=${newState} open=${newOpen}`,
      ].join(' | '),
    );

    if (!t.quote_hash) {
      violations.push(`${t.booking_code}: canonical room-change row has no frozen quote hash`);
    }

    if (t.workflow_state === 'COMPLETED') {
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
      if (!t.source_electricity_boundary_ok || !t.target_electricity_boundary_ok) {
        violations.push(
          `${t.booking_code}: completed transfer does not have matching half-open electricity reservation boundaries`,
        );
      }
    } else if (
      ['REQUESTED', 'QUOTED', 'TARGET_HELD', 'PAYMENT_PENDING', 'READY_TO_TRANSFER', 'TRANSFERRING'].includes(
        t.workflow_state,
      )
    ) {
      if (t.current_bed_id !== t.from_bed_id) {
        violations.push(
          `${t.booking_code}: pending transfer but resident not on source bed (${t.current_room}-${t.current_bed})`,
        );
      }
      if (newOpen) {
        violations.push(`${t.booking_code}: pending transfer but target publicly open (${newState})`);
      }
      if (!t.hold_active) {
        violations.push(`${t.booking_code}: pending transfer without active hold on target`);
      }
      if (
        t.workflow_state === 'PAYMENT_PENDING' &&
        t.expires_at &&
        t.expires_at.getTime() <= Date.now()
      ) {
        violations.push(`${t.booking_code}: payment-pending request is past its 72-hour deadline`);
      }
    } else if (['CANCELLED', 'EXPIRED', 'FAILED'].includes(t.workflow_state)) {
      if (t.hold_active) {
        violations.push(`${t.booking_code}: terminal ${t.workflow_state} request still blocks target`);
      }
      if (t.open_invoice_count > 0) {
        violations.push(
          `${t.booking_code}: terminal ${t.workflow_state} request has ${t.open_invoice_count} open invoices`,
        );
      }
      if (t.terminal_target_reservation_exists) {
        violations.push(
          `${t.booking_code}: terminal ${t.workflow_state} request created a target electricity occupancy segment`,
        );
      }
    }
  }

  const globalInvariantRows = await db.execute<{
    duplicate_open_requests: number;
    duplicate_active_primary: number;
    duplicate_active_holds: number;
  }>(sql`
    SELECT
      (
        SELECT count(*)::int FROM (
          SELECT booking_id
          FROM room_change_requests
          WHERE workflow_state NOT IN ('COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED')
          GROUP BY booking_id
          HAVING count(*) > 1
        ) rows
      ) AS duplicate_open_requests,
      (
        SELECT count(*)::int FROM (
          SELECT booking_id
          FROM bed_reservations
          WHERE kind = 'primary' AND status = 'active' AND CURRENT_DATE <@ stay_range
          GROUP BY booking_id
          HAVING count(*) > 1
        ) rows
      ) AS duplicate_active_primary,
      (
        SELECT count(*)::int FROM (
          SELECT bed_id
          FROM room_transfer_bed_holds
          WHERE status = 'active'
          GROUP BY bed_id
          HAVING count(*) > 1
        ) rows
      ) AS duplicate_active_holds
  `);
  const global = globalInvariantRows[0];
  if (global?.duplicate_open_requests) {
    violations.push(`platform: ${global.duplicate_open_requests} bookings have multiple open room changes`);
  }
  if (global?.duplicate_active_primary) {
    violations.push(`platform: ${global.duplicate_active_primary} bookings have multiple active primary beds`);
  }
  if (global?.duplicate_active_holds) {
    violations.push(`platform: ${global.duplicate_active_holds} beds have multiple active transfer holds`);
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

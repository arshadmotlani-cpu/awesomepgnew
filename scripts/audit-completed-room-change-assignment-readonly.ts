/**
 * SELECT-only: completed room changes vs active bed assignment.
 * No INSERT/UPDATE/DELETE.
 */
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';

config({ path: '.env' });
config({ path: '.env.local' });
config({ path: '.env.production.local' });
if (process.env.USE_PRODUCTION_DB === '1') {
  config({ path: '.env.prod.live', override: true });
}

function ensureDatabaseUrl(): void {
  if (process.env.USE_PRODUCTION_DB === '1') {
    try {
      const raw = readFileSync('.env.prod.live', 'utf8');
      const match = raw.match(/^DATABASE_URL=(.+)$/m);
      const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
      if (value && !value.includes('placeholder')) process.env.DATABASE_URL = value;
    } catch {
      // fall through
    }
  }
  if (process.env.DATABASE_URL?.trim()) return;
  for (const path of ['.env.prod.live', '.env.production.local', '.env.local', '.env.off']) {
    try {
      const raw = readFileSync(path, 'utf8');
      const match = raw.match(/^DATABASE_URL=(.+)$/m);
      const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
      if (value && !value.includes('placeholder')) {
        process.env.DATABASE_URL = value;
        return;
      }
    } catch {
      // next
    }
  }
}
ensureDatabaseUrl();

import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

async function main(): Promise<void> {
  const counts = await db.execute<{ workflow_state: string; status: string; n: number }>(sql`
    SELECT workflow_state, status, count(*)::int AS n
    FROM room_change_requests
    GROUP BY 1, 2
    ORDER BY n DESC
  `);
  const recentAll = await db.execute<{
    customer_name: string;
    workflow_state: string;
    status: string;
    transfer_date: string | null;
    settled_at: string | null;
    completed_at: string | null;
    from_label: string | null;
    to_label: string | null;
    active_today: string | null;
    active_count: number;
    hold_status: string | null;
    quote_rent: number | null;
    profile_rent: number | null;
  }>(sql`
    SELECT
      cu.full_name AS customer_name,
      rcr.workflow_state,
      rcr.status,
      rcr.expected_transfer_date::text AS transfer_date,
      rcr.settled_at::text,
      rcr.completed_at::text,
      fr.room_number || '-' || fb.bed_code AS from_label,
      tr.room_number || '-' || tb.bed_code AS to_label,
      (
        SELECT r.room_number || '-' || bd.bed_code
        FROM bed_reservations br
        JOIN beds bd ON bd.id = br.bed_id
        JOIN rooms r ON r.id = bd.room_id
        WHERE br.booking_id = rcr.booking_id
          AND br.kind = 'primary'
          AND br.status = 'active'
          AND CURRENT_DATE <@ br.stay_range
        ORDER BY lower(br.stay_range) DESC
        LIMIT 1
      ) AS active_today,
      (
        SELECT count(*)::int FROM bed_reservations br
        WHERE br.booking_id = rcr.booking_id AND br.kind = 'primary' AND br.status = 'active'
      ) AS active_count,
      h.status AS hold_status,
      (rcr.quote_snapshot->>'newMonthlyRentPaise')::bigint AS quote_rent,
      rbp.rent_amount_paise AS profile_rent
    FROM room_change_requests rcr
    JOIN customers cu ON cu.id = rcr.customer_id
    LEFT JOIN beds fb ON fb.id = rcr.from_bed_id
    LEFT JOIN rooms fr ON fr.id = fb.room_id
    LEFT JOIN beds tb ON tb.id = rcr.to_bed_id
    LEFT JOIN rooms tr ON tr.id = tb.room_id
    LEFT JOIN resident_billing_profiles rbp ON rbp.booking_id = rcr.booking_id
    LEFT JOIN LATERAL (
      SELECT status FROM room_transfer_bed_holds
      WHERE room_change_request_id = rcr.id
      ORDER BY updated_at DESC LIMIT 1
    ) h ON true
    ORDER BY rcr.updated_at DESC
    LIMIT 20
  `);
  const invoices = await db.execute<{
    source_table: string | null;
    status: string;
    amount_paise: number;
    paid_at: string | null;
  }>(sql`
    SELECT fi.source_table, fi.status, fi.amount_paise, fi.paid_at::text
    FROM financial_invoices fi
    JOIN room_change_requests rcr ON rcr.id = fi.source_id
    WHERE rcr.workflow_state NOT IN ('COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED')
    ORDER BY fi.created_at
  `);
  console.log(JSON.stringify({ counts, recentAll, invoices }, null, 2));

  const recent = await db.execute<{
    request_id: string;
    booking_id: string;
    customer_id: string;
    customer_name: string;
    workflow_state: string;
    status: string;
    from_bed_id: string;
    to_bed_id: string;
    from_room: string;
    to_room: string;
    from_bed: string;
    to_bed: string;
    completed_at: string | null;
    expected_transfer_date: string | null;
    active_bed_id: string | null;
    active_bed: string | null;
    active_room: string | null;
    active_count: number;
    lowest_uuid_bed: string | null;
    lowest_uuid_room: string | null;
    quote_rent: number | null;
    snapshot_rent: number | null;
    profile_rent: number | null;
  }>(sql`
    WITH completed AS (
      SELECT
        rcr.id AS request_id,
        rcr.booking_id,
        rcr.customer_id,
        rcr.workflow_state,
        rcr.status,
        rcr.from_bed_id,
        rcr.to_bed_id,
        rcr.completed_at,
        rcr.expected_transfer_date,
        (rcr.quote_snapshot->>'newMonthlyRentPaise')::bigint AS quote_rent
      FROM room_change_requests rcr
      WHERE rcr.workflow_state = 'COMPLETED' OR rcr.status = 'completed'
      ORDER BY rcr.completed_at DESC NULLS LAST, rcr.updated_at DESC
      LIMIT 25
    )
    SELECT
      c.request_id::text,
      c.booking_id::text,
      c.customer_id::text,
      cu.full_name AS customer_name,
      c.workflow_state,
      c.status,
      c.from_bed_id::text,
      c.to_bed_id::text,
      fr.room_number AS from_room,
      tr.room_number AS to_room,
      fb.bed_code AS from_bed,
      tb.bed_code AS to_bed,
      c.completed_at::text,
      c.expected_transfer_date::text,
      ab.bed_id::text AS active_bed_id,
      ab.bed_code AS active_bed,
      ab.room_number AS active_room,
      COALESCE(ac.n, 0)::int AS active_count,
      lu.bed_code AS lowest_uuid_bed,
      lu.room_number AS lowest_uuid_room,
      c.quote_rent,
      COALESCE((
        SELECT sum((elem->>'monthlyRatePaise')::bigint)
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(b.pricing_snapshot->'perBed') = 'array'
            THEN b.pricing_snapshot->'perBed'
            ELSE '[]'::jsonb
          END
        ) elem
      ), 0)::bigint AS snapshot_rent,
      rbp.rent_amount_paise AS profile_rent
    FROM completed c
    JOIN customers cu ON cu.id = c.customer_id
    JOIN bookings b ON b.id = c.booking_id
    LEFT JOIN beds fb ON fb.id = c.from_bed_id
    LEFT JOIN rooms fr ON fr.id = fb.room_id
    LEFT JOIN beds tb ON tb.id = c.to_bed_id
    LEFT JOIN rooms tr ON tr.id = tb.room_id
    LEFT JOIN resident_billing_profiles rbp ON rbp.booking_id = c.booking_id
    LEFT JOIN LATERAL (
      SELECT br.bed_id, bd.bed_code, r.room_number
      FROM bed_reservations br
      JOIN beds bd ON bd.id = br.bed_id
      JOIN rooms r ON r.id = bd.room_id
      WHERE br.booking_id = c.booking_id
        AND br.kind = 'primary'
        AND br.status = 'active'
        AND (
          CURRENT_DATE <@ br.stay_range
          OR lower(br.stay_range) > CURRENT_DATE
        )
      ORDER BY (CURRENT_DATE <@ br.stay_range) DESC, lower(br.stay_range) DESC
      LIMIT 1
    ) ab ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS n
      FROM bed_reservations br
      WHERE br.booking_id = c.booking_id
        AND br.kind = 'primary'
        AND br.status = 'active'
    ) ac ON true
    LEFT JOIN LATERAL (
      SELECT bd.bed_code, r.room_number
      FROM bed_reservations br
      JOIN beds bd ON bd.id = br.bed_id
      JOIN rooms r ON r.id = bd.room_id
      WHERE br.booking_id = c.booking_id
        AND br.kind = 'primary'
      ORDER BY br.bed_id ASC
      LIMIT 1
    ) lu ON true
  `);

  const mismatches = recent.filter(
    (row) => row.active_bed_id && row.to_bed_id && row.active_bed_id !== row.to_bed_id,
  );
  const portalWouldShowOld = recent.filter(
    (row) =>
      row.lowest_uuid_bed &&
      row.to_bed &&
      row.lowest_uuid_bed !== row.to_bed &&
      row.active_bed === row.to_bed,
  );

  console.log(
    JSON.stringify(
      {
        certification: 'completed-room-change-assignment-readonly',
        recentCount: recent.length,
        assignmentMismatchCount: mismatches.length,
        portalLowestUuidWouldShowOldBed: portalWouldShowOld.length,
        mismatches: mismatches.slice(0, 10),
        portalWouldShowOld: portalWouldShowOld.slice(0, 10),
        recent: recent.slice(0, 8).map((r) => ({
          name: r.customer_name,
          workflow: r.workflow_state,
          from: `${r.from_room}-${r.from_bed}`,
          to: `${r.to_room}-${r.to_bed}`,
          active: `${r.active_room}-${r.active_bed}`,
          lowestUuid: `${r.lowest_uuid_room}-${r.lowest_uuid_bed}`,
          activeCount: r.active_count,
          completedAt: r.completed_at,
          quoteRent: r.quote_rent,
          snapshotRent: r.snapshot_rent,
          profileRent: r.profile_rent,
        })),
      },
      null,
      2,
    ),
  );
}

void main();

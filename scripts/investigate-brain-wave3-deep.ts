/**
 * Wave 3 deep dive — residency/draft/payment/tenancy cases.
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('investigate-brain-wave3-deep');

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeDb, db } from '@/src/db/client';
import { sql } from 'drizzle-orm';

function asRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const rows = (result as { rows?: Array<Record<string, unknown>> })?.rows;
  return Array.isArray(rows) ? rows : [];
}

async function main() {
  mkdirSync(join(process.cwd(), 'tmp'), { recursive: true });

  const residencyEnum = asRows(
    await db.execute(sql`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'residency_status'
      ORDER BY e.enumsortorder
    `),
  );

  const gowtham = asRows(
    await db.execute(sql`
      SELECT
        bk.id::text, bk.booking_code, bk.status::text, bk.duration_mode::text,
        br.status::text AS bed_status, br.kind::text, br.stay_range::text,
        lower(br.stay_range)::text AS stay_start,
        upper(br.stay_range)::text AS stay_end
      FROM bookings bk
      LEFT JOIN bed_reservations br ON br.booking_id = bk.id
      WHERE bk.customer_id = '746eac54-097f-4ee4-99c6-83b6316ebdaa'::uuid
      ORDER BY bk.created_at
    `),
  );

  const krishna = asRows(
    await db.execute(sql`
      SELECT
        c.id::text AS customer_id,
        c.residency_status::text,
        c.updated_at,
        bk.id::text AS booking_id,
        bk.booking_code,
        bk.status::text,
        br.stay_range::text,
        br.status::text AS bed_status,
        (
          SELECT json_agg(json_build_object('action', a.action, 'created_at', a.created_at, 'diff', a.diff)
            ORDER BY a.created_at DESC)
          FROM (
            SELECT action, created_at, diff FROM audit_log
            WHERE entity_id IN (c.id, bk.id)
            ORDER BY created_at DESC LIMIT 30
          ) a
        ) AS recent_audit
      FROM customers c
      JOIN bookings bk ON bk.customer_id = c.id AND bk.booking_code = 'APG-2026-0048'
      LEFT JOIN bed_reservations br ON br.booking_id = bk.id AND br.kind = 'primary'
      WHERE c.id = 'f36efddc-d997-4913-b210-2506862b4f1b'::uuid
    `),
  );

  const orphanPay = asRows(
    await db.execute(sql`
      SELECT
        p.id::text,
        p.amount_paise,
        p.status::text,
        p.purpose::text,
        p.provider::text,
        p.provider_payment_id,
        p.paid_at,
        p.created_at,
        p.raw_payload
      FROM payments p
      WHERE p.booking_id = (
        SELECT id FROM bookings WHERE booking_code = 'APG-2026-0040' LIMIT 1
      )
      ORDER BY p.created_at
    `),
  );

  const ghostResidents = asRows(
    await db.execute(sql`
      SELECT
        c.id::text,
        c.full_name,
        c.residency_status::text,
        c.created_at,
        c.updated_at,
        (SELECT count(*)::int FROM bookings bk WHERE bk.customer_id = c.id) AS booking_count,
        (SELECT string_agg(DISTINCT bk.status::text, ',') FROM bookings bk WHERE bk.customer_id = c.id) AS statuses,
        (
          SELECT a.action FROM audit_log a
          WHERE a.entity_id = c.id
          ORDER BY a.created_at DESC LIMIT 1
        ) AS last_audit_action
      FROM customers c
      WHERE c.id = ANY(ARRAY[
        '03b8b348-3dd2-4bc0-b2aa-78e41c58ff77',
        'c8de7923-df02-401f-ad44-03da24b425ac',
        '21a12f72-b3ac-4791-acaf-4684168a287c',
        '576062ce-d2f7-406e-86d8-aeb1de3590b4',
        '6f475389-27bc-403d-b094-bdfb3ae7fbd6',
        '746eac54-097f-4ee4-99c6-83b6316ebdaa',
        '4bef08bc-9e9e-46b3-9b8b-6848fee9cbc5',
        '4476684c-deda-4d00-bb56-ba68459e6356',
        'b3cb63c0-7eb4-4901-a728-8a339ce6e777',
        '30fd626c-c571-4eb7-9ca6-399daa450aec',
        '7f7b9369-f4af-4932-8a00-a284c595b3a2',
        '9ea2f624-d822-4b78-bd15-9bad0470e0ec'
      ]::uuid[])
    `),
  );

  const out = {
    residencyEnum,
    gowtham,
    krishna,
    orphanPay: orphanPay.map((p) => ({
      ...p,
      raw_payload:
        typeof p.raw_payload === 'object'
          ? p.raw_payload
          : String(p.raw_payload ?? '').slice(0, 500),
    })),
    ghostResidents,
  };
  writeFileSync(join(process.cwd(), 'tmp/brain-wave3-deep.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

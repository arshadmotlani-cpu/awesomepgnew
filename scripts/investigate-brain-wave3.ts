/**
 * Wave 3 investigation — read-only deep dive into remaining integrity issues.
 *   npx tsx --tsconfig tsconfig.json scripts/investigate-brain-wave3.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('investigate-brain-wave3');

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

  const activeNoTenancy = asRows(
    await db.execute(sql`
      SELECT
        c.id::text AS customer_id,
        c.full_name,
        c.phone,
        c.residency_status::text,
        c.is_test,
        c.updated_at,
        (
          SELECT json_agg(json_build_object(
            'booking_id', bk.id::text,
            'code', bk.booking_code,
            'status', bk.status::text,
            'duration_mode', bk.duration_mode::text,
            'created_at', bk.created_at,
            'cancelled_at', bk.cancelled_at
          ) ORDER BY bk.created_at DESC)
          FROM bookings bk WHERE bk.customer_id = c.id
        ) AS bookings,
        (
          SELECT count(*)::int FROM bed_reservations br
          JOIN bookings bk ON bk.id = br.booking_id
          WHERE bk.customer_id = c.id
            AND br.status = 'active' AND br.kind = 'primary'
            AND br.stay_range @> CURRENT_DATE
        ) AS active_beds_today
      FROM customers c
      WHERE c.residency_status = 'active'
        AND coalesce(c.is_test, false) = false
        AND NOT EXISTS (
          SELECT 1 FROM bookings bk
          JOIN bed_reservations br ON br.booking_id = bk.id
            AND br.status = 'active' AND br.kind = 'primary'
            AND br.stay_range @> CURRENT_DATE
          WHERE bk.customer_id = c.id AND bk.status = 'confirmed'
            AND bk.duration_mode::text IS DISTINCT FROM 'reserve'
        )
      ORDER BY c.updated_at DESC NULLS LAST
      LIMIT 50
    `),
  );

  const draftWithStay = asRows(
    await db.execute(sql`
      SELECT
        c.id::text AS customer_id,
        c.full_name,
        draft.id::text AS draft_id,
        draft.booking_code AS draft_code,
        draft.duration_mode::text AS draft_mode,
        draft.status::text AS draft_status,
        draft.created_at AS draft_created,
        draft.updated_at AS draft_updated,
        active.id::text AS active_id,
        active.booking_code AS active_code,
        active.status::text AS active_status,
        (
          SELECT count(*)::int FROM bed_reserve_holds h
          WHERE h.booking_id = draft.id
            AND h.status IN ('pending_payment', 'under_review', 'active')
        ) AS draft_live_holds,
        (
          SELECT count(*)::int FROM rent_invoices ri
          WHERE ri.booking_id = draft.id AND ri.status NOT IN ('cancelled')
        ) AS draft_rent_invoices,
        (
          SELECT count(*)::int FROM payments p
          WHERE p.booking_id = draft.id AND p.status = 'succeeded'
        ) AS draft_succeeded_payments
      FROM customers c
      JOIN bookings draft ON draft.customer_id = c.id
        AND draft.status = 'draft'
        AND draft.duration_mode::text IS DISTINCT FROM 'reserve'
      JOIN bookings active ON active.customer_id = c.id
        AND active.status = 'confirmed'
        AND active.duration_mode::text IS DISTINCT FROM 'reserve'
      JOIN bed_reservations br ON br.booking_id = active.id
        AND br.status = 'active' AND br.kind = 'primary'
        AND br.stay_range @> CURRENT_DATE
      WHERE coalesce(c.is_test, false) = false
      ORDER BY draft.created_at DESC
      LIMIT 50
    `),
  );

  const tenancyNoResidency = asRows(
    await db.execute(sql`
      SELECT
        c.id::text AS customer_id,
        c.full_name,
        c.phone,
        c.residency_status::text,
        c.updated_at AS customer_updated,
        bk.id::text AS booking_id,
        bk.booking_code,
        bk.status::text AS booking_status,
        bk.created_at AS booking_created,
        br.stay_range::text AS stay_range
      FROM customers c
      JOIN bookings bk ON bk.customer_id = c.id
        AND bk.status = 'confirmed'
        AND bk.duration_mode::text IS DISTINCT FROM 'reserve'
      JOIN bed_reservations br ON br.booking_id = bk.id
        AND br.status = 'active' AND br.kind = 'primary'
        AND br.stay_range @> CURRENT_DATE
      WHERE c.residency_status IS DISTINCT FROM 'active'
        AND coalesce(c.is_test, false) = false
      ORDER BY c.full_name
      LIMIT 50
    `),
  );

  const paymentOrphan = asRows(
    await db.execute(sql`
      SELECT
        p.id::text AS payment_id,
        p.status::text,
        p.amount_paise,
        p.provider::text,
        p.provider_payment_id,
        p.booking_id::text,
        p.purpose::text,
        p.created_at,
        bk.booking_code,
        bk.status::text AS booking_status,
        bk.customer_id::text AS customer_id,
        (
          SELECT json_agg(json_build_object(
            'invoice_id', ri.id::text,
            'invoice_number', ri.invoice_number,
            'status', ri.status::text,
            'payment_id', ri.payment_id::text,
            'rent_paise', ri.rent_paise,
            'paid_principal_paise', ri.paid_principal_paise,
            'billing_month', ri.billing_month
          ))
          FROM rent_invoices ri
          WHERE ri.booking_id = p.booking_id
            AND ri.status NOT IN ('cancelled')
        ) AS booking_rent_invoices,
        (
          SELECT count(*)::int FROM rent_invoices ri WHERE ri.payment_id = p.id
        ) AS linked_rent_count,
        (
          SELECT count(*)::int FROM electricity_invoices ei WHERE ei.payment_id = p.id
        ) AS linked_elec_count,
        (
          SELECT count(*)::int FROM financial_invoices fi WHERE fi.payment_id = p.id
        ) AS linked_fin_count,
        (
          SELECT count(*)::int FROM stay_extensions se WHERE se.payment_id = p.id
        ) AS linked_ext_count
      FROM payments p
      LEFT JOIN bookings bk ON bk.id = p.booking_id
      WHERE p.id = '85001d70-f680-46b0-8432-6a70b304eb53'::uuid
         OR (
           p.status = 'succeeded'
           AND p.purpose IN ('rent', 'electricity', 'extension')
           AND NOT EXISTS (SELECT 1 FROM rent_invoices ri WHERE ri.payment_id = p.id)
           AND NOT EXISTS (SELECT 1 FROM electricity_invoices ei WHERE ei.payment_id = p.id)
           AND NOT EXISTS (SELECT 1 FROM financial_invoices fi WHERE fi.payment_id = p.id)
           AND NOT EXISTS (SELECT 1 FROM stay_extensions se WHERE se.payment_id = p.id)
           AND p.created_at > NOW() - INTERVAL '180 days'
         )
      ORDER BY p.created_at DESC
      LIMIT 20
    `),
  );

  const out = {
    measuredAt: new Date().toISOString(),
    activeNoTenancy: { count: activeNoTenancy.length, rows: activeNoTenancy },
    draftWithStay: { count: draftWithStay.length, rows: draftWithStay },
    tenancyNoResidency: { count: tenancyNoResidency.length, rows: tenancyNoResidency },
    paymentOrphan: { count: paymentOrphan.length, rows: paymentOrphan },
  };

  const path = join(process.cwd(), 'tmp/brain-wave3-investigate.json');
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(`Wrote ${path}`);
  console.log(
    JSON.stringify(
      {
        activeNoTenancy: out.activeNoTenancy.count,
        draftWithStay: out.draftWithStay.count,
        tenancyNoResidency: out.tenancyNoResidency.count,
        paymentOrphan: out.paymentOrphan.count,
        sampleActiveNoTenancy: activeNoTenancy.slice(0, 3).map((r) => ({
          id: r.customer_id,
          name: r.full_name,
          status: r.residency_status,
          activeBeds: r.active_beds_today,
          bookings: r.bookings,
        })),
        draftSample: draftWithStay.slice(0, 6).map((r) => ({
          draft: r.draft_code,
          active: r.active_code,
          holds: r.draft_live_holds,
          rent: r.draft_rent_invoices,
          pay: r.draft_succeeded_payments,
          draftCreated: r.draft_created,
        })),
        tenancySample: tenancyNoResidency,
        paymentSample: paymentOrphan.slice(0, 3),
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

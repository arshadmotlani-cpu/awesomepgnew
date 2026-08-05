/**
 * Resident Brain integrity audit — Waqar vs Syed + fleet scan.
 * Read-only. Writes report to tmp/resident-brain-integrity-audit.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('resident-brain-integrity-audit');

import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import {
  customerHasOpenReserveLifecycle,
  customerHasResidentPortalAccess,
  getOpenReserveBookingCode,
} from '@/src/lib/residents/residentPortalAccess';
import { getActiveTenancyForCustomer } from '@/src/lib/residentActiveTenancy';
import { formatDate } from '@/src/lib/dates';

function firstOfMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

const OUT = join(process.cwd(), 'tmp', 'resident-brain-integrity-audit.json');

type Row = Record<string, unknown>;

function asRows(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[];
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: Row[] }).rows;
  }
  return [];
}

async function profileCustomer(customerId: string, label: string) {
  const customers = asRows(
    await db.execute(sql`
      SELECT id::text, full_name, phone, email, residency_status, created_at::text
      FROM customers WHERE id = ${customerId}::uuid LIMIT 1
    `),
  );
  const customer = customers[0] ?? null;

  const bookings = asRows(
    await db.execute(sql`
      SELECT
        bk.id::text, bk.booking_code, bk.status::text, bk.duration_mode::text,
        bk.created_at::text, bk.updated_at::text,
        bk.cancelled_at::text,
        bk.draft_expires_at::text,
        bk.is_test,
        (
          SELECT lower(br.stay_range)::text
          FROM bed_reservations br
          WHERE br.booking_id = bk.id AND br.kind = 'primary'
          ORDER BY (br.status = 'active') DESC, br.created_at DESC
          LIMIT 1
        ) AS stay_start,
        (
          SELECT upper(br.stay_range)::text
          FROM bed_reservations br
          WHERE br.booking_id = bk.id AND br.kind = 'primary'
          ORDER BY (br.status = 'active') DESC, br.created_at DESC
          LIMIT 1
        ) AS stay_end
      FROM bookings bk
      WHERE bk.customer_id = ${customerId}::uuid
      ORDER BY bk.created_at DESC
    `),
  );

  const bedReservations = asRows(
    await db.execute(sql`
      SELECT
        br.id::text AS bed_reservation_id,
        br.booking_id::text,
        br.bed_id::text,
        br.status::text AS br_status,
        br.kind::text,
        b.bed_code,
        r.room_number,
        f.floor_number,
        p.name AS pg_name,
        bk.booking_code,
        bk.status::text AS booking_status,
        bk.duration_mode::text,
        lower(br.stay_range)::text AS stay_start,
        upper(br.stay_range)::text AS stay_end
      FROM bed_reservations br
      JOIN bookings bk ON bk.id = br.booking_id
      JOIN beds b ON b.id = br.bed_id
      JOIN rooms r ON r.id = b.room_id
      JOIN floors f ON f.id = r.floor_id
      JOIN pgs p ON p.id = f.pg_id
      WHERE bk.customer_id = ${customerId}::uuid
      ORDER BY br.created_at DESC
    `),
  );

  const holds = asRows(
    await db.execute(sql`
      SELECT
        h.id::text, h.booking_id::text, h.status::text,
        h.created_at::text, bk.booking_code, bk.status::text AS booking_status
      FROM bed_reserve_holds h
      JOIN bookings bk ON bk.id = h.booking_id
      WHERE bk.customer_id = ${customerId}::uuid
      ORDER BY h.created_at DESC
    `),
  );

  const rentRows = asRows(
    await db.execute(sql`
      SELECT
        id::text, invoice_number, billing_month::text, rent_paise,
        status::text, is_adhoc, booking_id::text,
        left(coalesce(payment_proof_url, ''), 80) AS proof_prefix,
        left(coalesce(notes, ''), 120) AS notes,
        created_at::text
      FROM rent_invoices
      WHERE customer_id = ${customerId}::uuid
      ORDER BY billing_month DESC, created_at DESC
    `),
  );

  const openReserve = await customerHasOpenReserveLifecycle(customerId);
  const openReserveCode = await getOpenReserveBookingCode(customerId);
  const portalAccess = await customerHasResidentPortalAccess(customerId);
  const tenancy = await getActiveTenancyForCustomer(customerId);
  const currentMonth = firstOfMonth(formatDate(new Date()));

  const currentMonthRent = rentRows.filter(
    (r) =>
      r.billing_month === currentMonth &&
      r.is_adhoc !== true &&
      r.status !== 'cancelled',
  );

  return {
    label,
    customer,
    portal: {
      openReserve,
      openReserveCode,
      portalAccess,
      wouldRedirectTo: openReserveCode
        ? `/booking/${openReserveCode}`
        : portalAccess
          ? '/account/profile?section=resident (modern)'
          : '/account/bookings',
    },
    tenancy,
    bookings,
    bedReservations,
    holds,
    rentInvoiceCount: rentRows.length,
    currentMonth,
    currentMonthRent,
    recentRent: rentRows.slice(0, 12),
    syntheticRent: rentRows.filter(
      (r) =>
        String(r.notes ?? '').match(/OPTVERIFY|OPTBROWSER|REPROFAIL|P0OUTBOX/i) ||
        String(r.billing_month ?? '') >= '2090-01-01',
    ),
  };
}

async function findByName(pattern: string) {
  return asRows(
    await db.execute(sql`
      SELECT id::text, full_name, phone, residency_status
      FROM customers
      WHERE full_name ILIKE ${pattern}
      ORDER BY created_at DESC
      LIMIT 20
    `),
  );
}

async function fleetPortalViolations() {
  const blockedWithStay = asRows(
    await db.execute(sql`
      WITH active_stays AS (
        SELECT DISTINCT ON (bk.customer_id)
          bk.customer_id,
          bk.id AS stay_booking_id,
          bk.booking_code AS stay_booking_code,
          c.full_name,
          c.phone,
          c.residency_status
        FROM bookings bk
        JOIN customers c ON c.id = bk.customer_id
        JOIN bed_reservations br ON br.booking_id = bk.id
          AND br.status = 'active' AND br.kind = 'primary'
        WHERE bk.status = 'confirmed'
          AND bk.duration_mode::text IS DISTINCT FROM 'reserve'
          AND (
            (br.stay_range @> CURRENT_DATE)
            OR (
              lower(br.stay_range) > CURRENT_DATE
              AND bk.duration_mode IN ('monthly', 'open_ended')
            )
          )
        ORDER BY bk.customer_id, (br.stay_range @> CURRENT_DATE) DESC, lower(br.stay_range) DESC
      ),
      open_reserves AS (
        SELECT DISTINCT ON (bk.customer_id)
          bk.customer_id,
          bk.id AS reserve_booking_id,
          bk.booking_code AS reserve_booking_code,
          bk.status AS reserve_status,
          bk.created_at AS reserve_created_at
        FROM bookings bk
        LEFT JOIN bed_reserve_holds h ON h.booking_id = bk.id
        WHERE bk.duration_mode = 'reserve'
          AND bk.status IN ('draft', 'pending_payment', 'pending_approval')
          AND (
            h.id IS NULL
            OR h.status IN ('pending_payment', 'under_review', 'active')
          )
        ORDER BY bk.customer_id, bk.created_at DESC
      )
      SELECT
        a.customer_id::text,
        a.full_name,
        a.phone,
        a.residency_status,
        a.stay_booking_id::text,
        a.stay_booking_code,
        o.reserve_booking_id::text,
        o.reserve_booking_code,
        o.reserve_status::text,
        o.reserve_created_at::text
      FROM active_stays a
      JOIN open_reserves o ON o.customer_id = a.customer_id
      ORDER BY a.full_name
    `),
  );

  const noTenancyButResidencyActive = asRows(
    await db.execute(sql`
      SELECT
        c.id::text AS customer_id,
        c.full_name,
        c.phone,
        c.residency_status,
        (
          SELECT count(*)::int FROM bookings bk
          WHERE bk.customer_id = c.id AND bk.status = 'confirmed'
        ) AS confirmed_bookings,
        (
          SELECT count(*)::int FROM bookings bk
          WHERE bk.customer_id = c.id
            AND bk.duration_mode = 'reserve'
            AND bk.status IN ('draft', 'pending_payment', 'pending_approval')
        ) AS open_reserves
      FROM customers c
      WHERE c.residency_status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM bookings bk
          JOIN bed_reservations br ON br.booking_id = bk.id
            AND br.status = 'active' AND br.kind = 'primary'
          WHERE bk.customer_id = c.id
            AND bk.status = 'confirmed'
            AND bk.duration_mode::text IS DISTINCT FROM 'reserve'
            AND (
              (br.stay_range @> CURRENT_DATE)
              OR (
                lower(br.stay_range) > CURRENT_DATE
                AND bk.duration_mode IN ('monthly', 'open_ended')
              )
            )
        )
      ORDER BY c.full_name
      LIMIT 200
    `),
  );

  const draftBookingsAll = asRows(
    await db.execute(sql`
      SELECT
        bk.id::text AS booking_id,
        bk.booking_code,
        bk.status::text,
        bk.duration_mode::text,
        bk.created_at::text,
        c.id::text AS customer_id,
        c.full_name,
        c.phone,
        c.residency_status,
        EXISTS (
          SELECT 1
          FROM bookings stay
          JOIN bed_reservations br ON br.booking_id = stay.id
            AND br.status = 'active' AND br.kind = 'primary'
          WHERE stay.customer_id = c.id
            AND stay.status = 'confirmed'
            AND stay.duration_mode::text IS DISTINCT FROM 'reserve'
            AND br.stay_range @> CURRENT_DATE
        ) AS has_active_stay
      FROM bookings bk
      JOIN customers c ON c.id = bk.customer_id
      WHERE bk.status = 'draft'
         OR (bk.duration_mode = 'reserve' AND bk.status IN ('draft', 'pending_payment', 'pending_approval'))
      ORDER BY bk.created_at DESC
      LIMIT 300
    `),
  );

  return { blockedWithStay, noTenancyButResidencyActive, draftBookingsAll };
}

async function billingFleetAudit() {
  const currentMonth = firstOfMonth(formatDate(new Date()));

  const activeWithoutCurrentRent = asRows(
    await db.execute(sql`
      WITH active_stays AS (
        SELECT DISTINCT ON (bk.customer_id)
          bk.customer_id,
          bk.id AS booking_id,
          bk.booking_code,
          c.full_name,
          c.phone,
          lower(br.stay_range)::date AS stay_start,
          f.pg_id
        FROM bookings bk
        JOIN customers c ON c.id = bk.customer_id
        JOIN bed_reservations br ON br.booking_id = bk.id
          AND br.status = 'active' AND br.kind = 'primary'
        JOIN beds bd ON bd.id = br.bed_id
        JOIN rooms r ON r.id = bd.room_id
        JOIN floors f ON f.id = r.floor_id
        WHERE bk.status = 'confirmed'
          AND bk.duration_mode IN ('monthly', 'open_ended')
          AND br.stay_range @> CURRENT_DATE
        ORDER BY bk.customer_id, lower(br.stay_range) DESC
      )
      SELECT
        a.customer_id::text,
        a.full_name,
        a.phone,
        a.booking_id::text,
        a.booking_code,
        a.pg_id::text,
        a.stay_start::text,
        (
          SELECT count(*)::int FROM rent_invoices ri
          WHERE ri.booking_id = a.booking_id
            AND ri.billing_month = ${currentMonth}::date
            AND ri.is_adhoc = false
            AND ri.status <> 'cancelled'
        ) AS current_month_rent_count
      FROM active_stays a
      WHERE NOT EXISTS (
        SELECT 1 FROM rent_invoices ri
        WHERE ri.booking_id = a.booking_id
          AND ri.billing_month = ${currentMonth}::date
          AND ri.is_adhoc = false
          AND ri.status <> 'cancelled'
      )
      ORDER BY a.full_name
    `),
  );

  const duplicateCurrentRent = asRows(
    await db.execute(sql`
      SELECT
        ri.booking_id::text,
        ri.customer_id::text,
        c.full_name,
        ri.billing_month::text,
        count(*)::int AS n,
        array_agg(ri.invoice_number ORDER BY ri.created_at) AS invoice_numbers
      FROM rent_invoices ri
      JOIN customers c ON c.id = ri.customer_id
      WHERE ri.billing_month = ${currentMonth}::date
        AND ri.is_adhoc = false
        AND ri.status <> 'cancelled'
      GROUP BY ri.booking_id, ri.customer_id, c.full_name, ri.billing_month
      HAVING count(*) > 1
      ORDER BY n DESC, c.full_name
    `),
  );

  const duplicateCustomersByPhone = asRows(
    await db.execute(sql`
      SELECT
        regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') AS phone_digits,
        count(*)::int AS n,
        array_agg(id::text ORDER BY created_at) AS customer_ids,
        array_agg(full_name ORDER BY created_at) AS names
      FROM customers
      WHERE phone IS NOT NULL AND length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 10
      GROUP BY 1
      HAVING count(*) > 1
      ORDER BY n DESC
      LIMIT 50
    `),
  );

  return {
    currentMonth,
    activeWithoutCurrentRent,
    duplicateCurrentRent,
    duplicateCustomersByPhone,
  };
}

async function main() {
  mkdirSync(join(process.cwd(), 'tmp'), { recursive: true });

  const waqars = await findByName('%Waqar%');
  const syeds = await findByName('%Syed%Ahmed%');

  const waqarProfiles = [];
  for (const w of waqars) {
    waqarProfiles.push(await profileCustomer(String(w.id), String(w.full_name)));
  }
  const syedProfiles = [];
  for (const s of syeds.slice(0, 5)) {
    syedProfiles.push(await profileCustomer(String(s.id), String(s.full_name)));
  }

  const knownWaqarId = '72772e2a-1466-440b-8413-01d4516cd09e';
  if (!waqarProfiles.some((p) => p.customer && String(p.customer.id) === knownWaqarId)) {
    waqarProfiles.push(await profileCustomer(knownWaqarId, 'Waqar (known id)'));
  }

  const fleet = await fleetPortalViolations();
  const billing = await billingFleetAudit();

  const report = {
    generatedAt: new Date().toISOString(),
    nameMatches: { waqars, syeds },
    waqarProfiles,
    syedProfiles,
    fleet,
    billing,
  };

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        out: OUT,
        waqarCount: waqars.length,
        syedCount: syeds.length,
        blockedWithStay: fleet.blockedWithStay.length,
        noTenancyActive: fleet.noTenancyButResidencyActive.length,
        draftOrOpenReserve: fleet.draftBookingsAll.length,
        missingCurrentRent: billing.activeWithoutCurrentRent.length,
        duplicateRent: billing.duplicateCurrentRent.length,
        duplicatePhones: billing.duplicateCustomersByPhone.length,
        waqarPortal: waqarProfiles.map((p) => ({
          name: p.customer?.full_name,
          id: p.customer?.id,
          residency: p.customer?.residency_status,
          portal: p.portal,
          tenancy: p.tenancy
            ? {
                bookingId: p.tenancy.bookingId,
                bookingCode: p.tenancy.bookingCode,
                room: p.tenancy.roomNumber,
                bed: p.tenancy.bedCode,
                pg: p.tenancy.pgName,
              }
            : null,
          bookings: p.bookings.map((b) => ({
            code: b.booking_code,
            status: b.status,
            mode: b.duration_mode,
            stay: `${b.stay_start}→${b.stay_end}`,
          })),
          currentMonthRent: p.currentMonthRent.length,
          holds: p.holds.length,
        })),
        syedPortal: syedProfiles.map((p) => ({
          name: p.customer?.full_name,
          id: p.customer?.id,
          residency: p.customer?.residency_status,
          portal: p.portal,
          tenancy: p.tenancy
            ? {
                bookingId: p.tenancy.bookingId,
                bookingCode: p.tenancy.bookingCode,
                room: p.tenancy.roomNumber,
                bed: p.tenancy.bedCode,
              }
            : null,
          currentMonthRent: p.currentMonthRent.length,
        })),
        blockedSample: fleet.blockedWithStay.slice(0, 30),
        missingRentSample: billing.activeWithoutCurrentRent.slice(0, 40),
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

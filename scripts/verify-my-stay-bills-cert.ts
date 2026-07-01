#!/usr/bin/env npx tsx
/**
 * My Stay bill discoverability certification.
 *
 *   DOTENV_CONFIG_PATH=.env.production.runtime npx tsx scripts/verify-my-stay-bills-cert.ts
 *   DOTENV_CONFIG_PATH=.env.production.runtime npx tsx scripts/verify-my-stay-bills-cert.ts --execute-rent
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import {
  listElectricityInvoicesForBooking,
  listRentInvoicesForBooking,
  listResidentBookingsForCustomer,
} from '@/src/db/queries/customer';
import { getBookingFinancialAccount } from '@/src/services/residentFinancialEngine';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
import { projectInvoice } from '@/src/services/rentInvoices';
import { ensureMonthlyRentInvoice } from '@/src/services/rentInvoices';

const JULY = '2026-07-01';
const EXECUTE_RENT = process.argv.includes('--execute-rent');

type Check = { pg: string; resident: string; pass: boolean; detail: string };

async function dueRowsForBooking(bookingId: string) {
  const [rent, electricity] = await Promise.all([
    listRentInvoicesForBooking(bookingId),
    listElectricityInvoicesForBooking(bookingId),
  ]);
  const rows: string[] = [];
  if (rent.ok) {
    for (const r of rent.data) {
      if (r.status === 'paid' || r.status === 'cancelled') continue;
      const projected = projectInvoice({
        ...r,
        cancelledAt: null,
        cancellationReason: null,
        customerId: '',
        bedId: '',
        pgId: '',
        paymentId: null,
        paymentProofUrl: null,
        isAdhoc: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      if (projected.outstandingPaise > 0) {
        rows.push(`rent:${r.invoiceNumber}:${projected.outstandingPaise}`);
      }
    }
  }
  if (electricity.ok) {
    for (const e of electricity.data) {
      if (e.status === 'paid' || e.status === 'cancelled') continue;
      const projected = projectElectricityInvoice({
        id: e.id,
        invoiceNumber: e.invoiceNumber,
        electricityBillId: e.electricityBillId,
        roomId: e.roomId,
        bookingId: e.bookingId,
        customerId: '',
        bedId: '',
        billingMonth: e.billingMonth,
        amountPaise: e.amountPaise,
        paidPaise: e.paidPaise,
        lateFeeLockedPaise: e.lateFeeLockedPaise,
        status: e.status,
        paymentId: null,
        paidAt: e.paidAt,
        paymentProofUrl: null,
        unitsShare: null,
        activeDays: null,
        cancelledAt: null,
        supersededByInvoiceId: null,
        duplicateDetectedAt: null,
        isPipelineTest: false,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        dueDate: e.dueDate,
      });
      if (projected.outstandingPaise > 0) {
        rows.push(`elec:${e.invoiceNumber}:${projected.outstandingPaise}`);
      }
    }
  }
  return rows;
}

async function main() {
  const checks: Check[] = [];

  const pgs = await db.execute<{
    pg_id: string;
    pg_name: string;
    filter: string;
  }>(sql`
    SELECT id::text AS pg_id, name AS pg_name,
      CASE
        WHEN name ILIKE '%shantinagar%' OR slug ILIKE '%shantinagar%' THEN 'shantinagar'
        WHEN name ILIKE '%female%' OR slug ILIKE '%female%' THEN 'female'
        ELSE 'other'
      END AS filter
    FROM pgs
    WHERE name ILIKE '%shantinagar%'
       OR slug ILIKE '%shantinagar%'
       OR name ILIKE '%female%'
       OR slug ILIKE '%female%'
  `);

  for (const pg of pgs as { pg_id: string; pg_name: string; filter: string }[]) {
    if (pg.filter === 'other') continue;

    const residents = await db.execute<{
      customer_id: string;
      customer_name: string;
      booking_id: string;
      room_number: string;
      bed_code: string;
    }>(sql`
      SELECT DISTINCT ON (c.id)
        c.id::text AS customer_id,
        c.full_name AS customer_name,
        b.id::text AS booking_id,
        r.room_number,
        bd.bed_code
      FROM customers c
      INNER JOIN bookings b ON b.customer_id = c.id AND b.status = 'confirmed'
      INNER JOIN bed_reservations br ON br.booking_id = b.id
        AND br.status = 'active'
        AND br.kind = 'primary'
        AND CURRENT_DATE <@ br.stay_range
      INNER JOIN beds bd ON bd.id = br.bed_id
      INNER JOIN rooms r ON r.id = bd.room_id
      INNER JOIN floors f ON f.id = r.floor_id
      WHERE f.pg_id = ${pg.pg_id}::uuid
        AND (b.notes IS NULL OR NOT (b.notes ILIKE '%occupancy placeholder%'))
      ORDER BY c.id, lower(br.stay_range) DESC
    `);

    const residentRows = residents as {
      customer_id: string;
      customer_name: string;
      booking_id: string;
      room_number: string;
      bed_code: string;
    }[];

    if (residentRows.length === 0) {
      checks.push({
        pg: pg.pg_name,
        resident: '(no active residents)',
        pass: false,
        detail: 'No confirmed active primary reservations',
      });
    }

    for (const res of residentRows) {
      if (pg.filter === 'female' && EXECUTE_RENT) {
        const rentResult = await ensureMonthlyRentInvoice({
          bookingId: res.booking_id,
          billingMonth: JULY,
          amountPaise: 500_000,
        });
        if (!rentResult.ok) {
          checks.push({
            pg: pg.pg_name,
            resident: res.customer_name,
            pass: false,
            detail: `July rent ensure failed: ${rentResult.error}`,
          });
          continue;
        }
      }

      const portalBookings = await listResidentBookingsForCustomer(res.customer_id);
      const hasBooking =
        portalBookings.ok &&
        portalBookings.data.some((b) => b.bookingId === res.booking_id);

      const due = await dueRowsForBooking(res.booking_id);
      const account = await getBookingFinancialAccount({
        bookingId: res.booking_id,
        customerId: res.customer_id,
        customerName: res.customer_name,
        customerPhone: '',
        bookingCode: '',
        pgId: pg.pg_id,
        pgName: pg.pg_name,
        roomNumber: res.room_number,
        depositPaise: 0,
        depositDuePaise: 0,
      });
      const julyRent = await db.execute<{ cnt: number }>(sql`
        SELECT count(*)::int AS cnt FROM rent_invoices
        WHERE booking_id = ${res.booking_id}::uuid
          AND billing_month = ${JULY}::date
          AND status NOT IN ('cancelled')
      `);
      const julyRentCount = julyRent[0]?.cnt ?? 0;

      const pendingElec = due.filter((d) => d.startsWith('elec:'));
      const pendingRent = due.filter((d) => d.startsWith('rent:'));

      const pass =
        hasBooking &&
        (pg.filter !== 'female' || julyRentCount === 1) &&
        (account.electricity.outstandingPaise === 0 || pendingElec.length > 0) &&
        (account.rent.outstandingPaise === 0 || pendingRent.length > 0);

      checks.push({
        pg: pg.pg_name,
        resident: `${res.customer_name} · R${res.room_number}-${res.bed_code}`,
        pass,
        detail: [
          hasBooking ? 'portal booking ok' : 'MISSING portal booking',
          `My Stay due rows: ${due.length ? due.join(', ') : 'none'}`,
          `SSOT rent due ${account.rent.outstandingPaise} elec ${account.electricity.outstandingPaise} deposit ${account.deposit.outstandingPaise}`,
          pg.filter === 'female' ? `July rent invoices: ${julyRentCount}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      });
    }

    if (pg.filter === 'female') {
      const roomBill = await db.execute<{
        room_number: string;
        units: string;
        rate: number;
        gross: number;
        invoice_count: number;
      }>(sql`
        SELECT
          r.room_number,
          eb.units_consumed AS units,
          eb.rate_per_unit_paise AS rate,
          eb.total_paise AS gross,
          (
            SELECT count(*)::int FROM electricity_invoices ei
            WHERE ei.electricity_bill_id = eb.id AND ei.status = 'pending'
          ) AS invoice_count
        FROM electricity_bills eb
        INNER JOIN rooms r ON r.id = eb.room_id
        INNER JOIN floors f ON f.id = r.floor_id
        WHERE f.pg_id = ${pg.pg_id}::uuid
          AND eb.billing_month >= date_trunc('month', CURRENT_DATE)::date
        ORDER BY eb.billing_month DESC, r.room_number
        LIMIT 5
      `);
      for (const bill of roomBill as {
        room_number: string;
        units: string;
        rate: number;
        gross: number;
        invoice_count: number;
      }[]) {
        checks.push({
          pg: pg.pg_name,
          resident: `Room ${bill.room_number} electricity`,
          pass: bill.invoice_count >= 1,
          detail: `${bill.units} units · rate ₹${bill.rate / 100}/unit · gross ₹${bill.gross / 100} · ${bill.invoice_count} pending invoice(s)`,
        });
      }
    }
  }

  console.log('\n=== My Stay Bills Certification ===\n');
  let allPass = true;
  for (const c of checks) {
    console.log(`${c.pass ? '✓' : '✗'} [${c.pg}] ${c.resident}`);
    console.log(`    ${c.detail}`);
    if (!c.pass) allPass = false;
  }
  console.log(allPass ? '\n✓ PASS' : '\n✗ FAIL');
  await closeDb();
  process.exit(allPass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});

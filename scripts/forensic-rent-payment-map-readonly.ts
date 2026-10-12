/* eslint-disable no-console */
/**
 * Read-only forensic: Rent Payment Map vs actual rent invoices/payments.
 * USE_PRODUCTION_DB=1 npx tsx scripts/forensic-rent-payment-map-readonly.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('forensic-rent-payment-map-readonly');

import { and, eq, inArray, sql } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { rentInvoices } from '../src/db/schema';
import { resolveBillingMonth } from '../src/lib/dateDefaults';
import { todayString } from '../src/lib/dates';
import { buildRentInvoiceProjectInput } from '../src/lib/billing/rentInvoiceProjectInput';
import { classifyRentPaymentMapBed } from '../src/lib/billing/rentPaymentMapStatus';
import { firstOfMonth } from '../src/services/billing';
import { projectInvoice } from '../src/services/rentInvoices';

const RESIDENTS = [
  { room: '402', names: ['Disha', 'Jahnavee', 'Aakanksha'] },
  { room: '101', names: ['Rishik'] },
  { room: '102', names: ['Saswat', 'Sagar'] },
];

async function main() {
  const billingMonth = resolveBillingMonth(null);
  const today = todayString();
  console.log({ billingMonth, today, mapDefaultMonth: billingMonth });

  for (const group of RESIDENTS) {
    console.log(`\n========== ROOM ${group.room} ==========`);
    for (const namePart of group.names) {
      const residents = await db.execute<{
        customer_id: string;
        customer_name: string;
        booking_id: string;
        booking_code: string;
        bed_code: string;
        room_number: string;
        billing_day: number | null;
        billing_cycle_policy: string | null;
      }>(sql`
        SELECT
          c.id::text AS customer_id,
          c.full_name AS customer_name,
          bk.id::text AS booking_id,
          bk.booking_code,
          b.bed_code,
          r.room_number,
          rbp.billing_day,
          rbp.billing_cycle_policy
        FROM customers c
        INNER JOIN bookings bk ON bk.customer_id = c.id
        INNER JOIN bed_reservations br ON br.booking_id = bk.id AND br.kind = 'primary' AND br.status = 'active'
        INNER JOIN beds b ON b.id = br.bed_id
        INNER JOIN rooms r ON r.id = b.room_id
        LEFT JOIN resident_billing_profiles rbp ON rbp.booking_id = bk.id
        WHERE r.room_number = ${group.room}
          AND lower(c.full_name) LIKE ${`%${namePart.toLowerCase()}%`}
          AND bk.status = 'confirmed'
          AND bk.is_test = false
        LIMIT 3
      `);

      for (const res of residents) {
        console.log('\n---', res.customer_name, res.bed_code, '---');
        console.log('Booking:', res.booking_code, res.booking_id);
        console.log('Billing day:', res.billing_day, 'policy:', res.billing_cycle_policy);

        const allInvoices = await db
          .select()
          .from(rentInvoices)
          .where(eq(rentInvoices.bookingId, res.booking_id))
          .orderBy(rentInvoices.billingMonth);

        console.log('\nAll rent_invoices for booking:');
        for (const inv of allInvoices) {
          const projected = projectInvoice(buildRentInvoiceProjectInput(inv));
          console.log({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            billingMonth: inv.billingMonth,
            dueDate: inv.dueDate,
            status: inv.status,
            isAdhoc: inv.isAdhoc,
            subtype: inv.invoiceSubtype,
            amountPaise: inv.amountPaise,
            paidPrincipalPaise: inv.paidPrincipalPaise,
            paidLateFeePaise: inv.paidLateFeePaise,
            projectedOutstanding: projected.outstandingPaise,
            projectedEffectiveStatus: projected.effectiveStatus,
            notes: inv.notes?.slice(0, 80) ?? null,
          });
        }

        const openInvoices = allInvoices.filter((i) =>
          ['pending', 'overdue', 'payment_in_progress'].includes(i.status),
        );
        const openForMonth = openInvoices.filter(
          (i) => firstOfMonth(String(i.billingMonth)) === firstOfMonth(billingMonth),
        );

        console.log('\nOpen invoices (map query filter):', openInvoices.length);
        console.log('Open invoices with billing_month = map month:', openForMonth.length);

        const mapInvoice = openForMonth[0];
        const projected = mapInvoice ? projectInvoice(buildRentInvoiceProjectInput(mapInvoice)) : null;
        const mapStatus = classifyRentPaymentMapBed({
          isOccupiedInMonth: true,
          projected,
          paymentProofUrl: mapInvoice?.paymentProofUrl ?? null,
        });

        const paidForMonth = allInvoices.filter(
          (i) =>
            firstOfMonth(String(i.billingMonth)) === firstOfMonth(billingMonth) &&
            (i.status === 'paid' ||
              projectInvoice(buildRentInvoiceProjectInput(i)).outstandingPaise <= 0),
        );

        console.log('\nMap simulation (current code logic):');
        console.log('  Invoice row map would load:', mapInvoice?.invoiceNumber ?? '(none — paid/cancelled excluded)');
        console.log('  classifyRentPaymentMapBed →', mapStatus);
        console.log('  Paid/collected invoice(s) for map billing month:', paidForMonth.map((p) => p.invoiceNumber));

        const payments = await db.execute(sql`
          SELECT p.id, p.amount_paise, p.status, p.purpose, p.paid_at, p.created_at
          FROM payments p
          WHERE p.booking_id = ${res.booking_id}::uuid
            AND p.status = 'captured'
          ORDER BY p.created_at DESC
          LIMIT 6
        `);
        console.log('\nRecent captured payments (booking):', JSON.stringify(payments, null, 2));
      }
    }
  }

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

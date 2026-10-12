/* eslint-disable no-console */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('forensic-rpm-six.ts');

import { eq, sql } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { rentInvoices } from '../src/db/schema';
import { resolveBillingMonth } from '../src/lib/dateDefaults';
import { buildRentInvoiceProjectInput } from '../src/lib/billing/rentInvoiceProjectInput';
import { classifyRentPaymentMapBed } from '../src/lib/billing/rentPaymentMapStatus';
import { firstOfMonth } from '../src/services/billing';
import { projectInvoice } from '../src/services/rentInvoices';

const CASES = [
  { label: 'Disha', room: '402' },
  { label: 'Jahnavee', room: '402' },
  { label: 'Aakanksha', room: '402' },
  { label: 'Rishik', room: '101' },
  { label: 'Saswat', room: '102' },
  { label: 'Sagar', room: '102' },
];

async function main() {
  const billingMonth = resolveBillingMonth(null);
  console.log('Map billing month filter:', billingMonth, '\n');

  for (const c of CASES) {
    const rows = await db.execute<{
      full_name: string;
      bid: string;
      bed_code: string;
      room_number: string;
      billing_day: number | null;
      billing_cycle_policy: string | null;
    }>(sql`
      SELECT c.full_name, bk.id::text AS bid, b.bed_code, r.room_number,
        rbp.billing_day, rbp.billing_cycle_policy
      FROM customers c
      JOIN bookings bk ON bk.customer_id = c.id AND bk.status = 'confirmed' AND bk.is_test = false
      JOIN bed_reservations br ON br.booking_id = bk.id AND br.status = 'active' AND br.kind = 'primary'
      JOIN beds b ON b.id = br.bed_id
      JOIN rooms r ON r.id = b.room_id
      LEFT JOIN resident_billing_profiles rbp ON rbp.booking_id = bk.id
      WHERE r.room_number = ${c.room}
        AND lower(c.full_name) LIKE ${`%${c.label.toLowerCase()}%`}
      LIMIT 1
    `);
    const r = rows[0];
    if (!r) {
      console.log(c.label, 'NOT FOUND');
      continue;
    }

    const invs = await db.select().from(rentInvoices).where(eq(rentInvoices.bookingId, r.bid));
    const sep = invs.filter(
      (x) => firstOfMonth(String(x.billingMonth)) === firstOfMonth(billingMonth),
    );
    const paidSep = sep.find(
      (x) => x.status === 'paid' || projectInvoice(buildRentInvoiceProjectInput(x)).outstandingPaise <= 0,
    );
    const openSep = sep.filter((x) =>
      ['pending', 'overdue', 'payment_in_progress'].includes(x.status),
    );
    const mapInv = openSep[0];
    const proj = mapInv ? projectInvoice(buildRentInvoiceProjectInput(mapInv)) : null;
    const mapStatus = classifyRentPaymentMapBed({ isOccupiedInMonth: true, projected: proj });
    const paidProj = paidSep ? projectInvoice(buildRentInvoiceProjectInput(paidSep)) : null;

    console.log({
      resident: r.full_name,
      roomBed: `${r.room_number}/${r.bed_code}`,
      billingCycle: `day ${r.billing_day ?? '?'} / ${r.billing_cycle_policy ?? 'unknown'}`,
      invoiceMapLoaderWouldUse: mapInv?.invoiceNumber ?? '(none — only pending/overdue/in_progress queried)',
      sep2026Invoice: paidSep?.invoiceNumber ?? openSep[0]?.invoiceNumber ?? '(none)',
      invoiceAmountPaise: paidProj?.totalPaise ?? proj?.totalPaise ?? null,
      amountPaidPaise: paidSep
        ? paidSep.paidPrincipalPaise + paidSep.paidLateFeePaise
        : mapInv
          ? mapInv.paidPrincipalPaise + mapInv.paidLateFeePaise
          : 0,
      invoiceStatus: paidSep?.status ?? mapInv?.status ?? '—',
      invoiceNotes: (paidSep ?? mapInv)?.notes?.slice(0, 60) ?? null,
      mapUiStatus: mapStatus,
      why: mapInv
        ? 'Open invoice with outstanding'
        : paidSep
          ? 'BUG: Sep invoice paid but loader excludes status=paid → no projected → NOT PAID'
          : 'No Sep invoice at all',
    });
  }
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

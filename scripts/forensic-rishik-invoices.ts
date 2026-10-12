/* eslint-disable no-console */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('forensic-rishik.ts');

import { eq, sql } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { rentInvoices } from '../src/db/schema';
import { buildRentInvoiceProjectInput } from '../src/lib/billing/rentInvoiceProjectInput';
import { projectInvoice } from '../src/services/rentInvoices';

async function main() {
  const rows = await db.execute<{ bid: string; full_name: string }>(sql`
    SELECT bk.id::text AS bid, c.full_name
    FROM customers c
    JOIN bookings bk ON bk.customer_id = c.id AND bk.status = 'confirmed' AND bk.is_test = false
    JOIN bed_reservations br ON br.booking_id = bk.id AND br.status = 'active' AND br.kind = 'primary'
    JOIN beds b ON b.id = br.bed_id
    JOIN rooms r ON r.id = b.room_id
    WHERE r.room_number = '101' AND lower(c.full_name) LIKE '%rishik%'
    LIMIT 1
  `);
  const r = rows[0];
  if (!r) {
    console.log('not found');
    await closeDb();
    return;
  }
  const invs = await db.select().from(rentInvoices).where(eq(rentInvoices.bookingId, r.bid));
  console.log(r.full_name, r.bid);
  for (const inv of invs) {
    const p = projectInvoice(buildRentInvoiceProjectInput(inv));
    console.log({
      num: inv.invoiceNumber,
      month: String(inv.billingMonth).slice(0, 10),
      due: String(inv.dueDate).slice(0, 10),
      status: inv.status,
      adhoc: inv.isAdhoc,
      subtype: inv.invoiceSubtype,
      rent: inv.rentPaise,
      paidP: inv.paidPrincipalPaise,
      paidL: inv.paidLateFeePaise,
      total: p.totalPaise,
      outstanding: p.outstandingPaise,
      effective: p.effectiveStatus,
      notes: inv.notes,
    });
  }
  await closeDb();
}
main();

#!/usr/bin/env npx tsx
/** Migrate any live Dhairya invoice/action/residency refs from archived 201-B2 → 201-B1. */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { eq, sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { auditLog, rentInvoices } from '@/src/db/schema';
import { syncRentInvoiceToUnified } from '@/src/services/unifiedInvoices';

const B1 = 'f85878bf-abaa-4592-bb8b-47d44e287466';
const B2 = 'f22a5473-811c-4454-a679-b888ac954cc3';

async function main() {
  const pending = await db.execute<{ id: string; invoice_number: string; bed_code: string }>(sql`
    SELECT ri.id::text, ri.invoice_number, b.bed_code
    FROM rent_invoices ri
    INNER JOIN beds b ON b.id = ri.bed_id
    INNER JOIN bookings bk ON bk.id = ri.booking_id
    INNER JOIN customers c ON c.id = bk.customer_id
    WHERE c.full_name ILIKE '%dhairya%'
      AND b.id = ${B2}::uuid
      AND ri.status IN ('pending', 'overdue', 'payment_in_progress')
  `);

  console.log(`Pending rent invoices on B2: ${pending.length}`);
  for (const row of pending) {
    await db
      .update(rentInvoices)
      .set({ bedId: B1, updatedAt: new Date() })
      .where(eq(rentInvoices.id, row.id));
    await syncRentInvoiceToUnified(row.id);
    await db.insert(auditLog).values({
      actorType: 'system',
      entity: 'rent_invoice',
      entityId: row.id,
      action: 'room201_migrate_invoice_bed_ref',
      diff: { fromBedId: B2, toBedId: B1, invoiceNumber: row.invoice_number },
    });
    console.log(`  Migrated ${row.invoice_number} → B1`);
  }

  const residency = await db.execute(sql`
    UPDATE resident_residencies rr
    SET current_bed_id = ${B1}::uuid, updated_at = now()
    FROM bookings bk
    INNER JOIN customers c ON c.id = bk.customer_id
    WHERE rr.current_booking_id = bk.id
      AND c.full_name ILIKE '%dhairya%'
      AND (rr.current_bed_id IS NULL OR rr.current_bed_id = ${B2}::uuid)
    RETURNING rr.id::text
  `);
  console.log(`Residency rows updated: ${Array.isArray(residency) ? residency.length : 0}`);

  const financial = await db.execute(sql`
    UPDATE financial_invoices fi
    SET bed_id = ${B1}::uuid, updated_at = now()
    FROM customers c
    WHERE fi.customer_id = c.id
      AND c.full_name ILIKE '%dhairya%'
      AND fi.bed_id = ${B2}::uuid
      AND fi.status NOT IN ('cancelled', 'refunded', 'paid')
    RETURNING fi.id::text
  `);
  console.log(`Open financial invoices updated: ${Array.isArray(financial) ? financial.length : 0}`);

  const electricity = await db.execute(sql`
    UPDATE electricity_invoices ei
    SET bed_id = ${B1}::uuid, updated_at = now()
    FROM bookings bk
    INNER JOIN customers c ON c.id = bk.customer_id
    WHERE ei.booking_id = bk.id
      AND c.full_name ILIKE '%dhairya%'
      AND ei.bed_id = ${B2}::uuid
      AND ei.status = 'pending'
    RETURNING ei.id::text
  `);
  console.log(`Pending electricity invoices updated: ${Array.isArray(electricity) ? electricity.length : 0}`);

  const actions = await db.execute(sql`
    UPDATE action_items ai
    SET bed_id = ${B1}::uuid, updated_at = now()
    FROM customers c
    WHERE ai.resident_id = c.id
      AND c.full_name ILIKE '%dhairya%'
      AND ai.bed_id = ${B2}::uuid
      AND ai.status = 'open'
    RETURNING ai.id::text
  `);
  console.log(`Open action items updated: ${Array.isArray(actions) ? actions.length : 0}`);

  const verify = await db.execute(sql`
    SELECT 'active_reservation' AS kind, b.bed_code, b.archived_at IS NOT NULL AS archived
    FROM bed_reservations br
    INNER JOIN beds b ON b.id = br.bed_id
    INNER JOIN bookings bk ON bk.id = br.booking_id
    INNER JOIN customers c ON c.id = bk.customer_id
    WHERE c.full_name ILIKE '%dhairya%' AND br.status = 'active'
    UNION ALL
    SELECT 'open_rent_invoice', b.bed_code, b.archived_at IS NOT NULL AS archived
    FROM rent_invoices ri
    INNER JOIN beds b ON b.id = ri.bed_id
    INNER JOIN bookings bk ON bk.id = ri.booking_id
    INNER JOIN customers c ON c.id = bk.customer_id
    WHERE c.full_name ILIKE '%dhairya%' AND ri.status IN ('pending', 'overdue', 'payment_in_progress')
    UNION ALL
    SELECT 'b2_active_reservation', b.bed_code, b.archived_at IS NOT NULL AS archived
    FROM bed_reservations br
    INNER JOIN beds b ON b.id = br.bed_id
    INNER JOIN rooms r ON r.id = b.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE p.name ILIKE '%shanti%' AND r.room_number = '201' AND b.bed_code = 'B2'
      AND br.status IN ('hold', 'active')
  `);

  console.log('\nVerification:');
  console.log(JSON.stringify(verify, null, 2));

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});

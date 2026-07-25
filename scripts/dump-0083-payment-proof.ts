#!/usr/bin/env npx tsx
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('dump-0083-proof.ts');
import { closeDb, db } from '@/src/db/client';
import { sql } from 'drizzle-orm';

const CODE = 'APG-2026-0083';

async function main() {
  const [b] = await db.execute<{ id: string; booking_code: string }>(sql`
    SELECT id, booking_code FROM bookings WHERE booking_code = ${CODE} LIMIT 1
  `);
  if (!b) throw new Error('booking not found');
  const bookingId = b.id;

  const pgRecords = await db.execute(sql`
    SELECT *
    FROM pg_payment_records
    WHERE booking_id = ${bookingId}::uuid
    ORDER BY created_at
  `);

  const payments = await db.execute(sql`
    SELECT *
    FROM payments
    WHERE booking_id = ${bookingId}::uuid
    ORDER BY created_at
  `);

  const allocations = await db.execute(sql`
    SELECT *
    FROM payment_approval_allocations
    WHERE booking_id = ${bookingId}::uuid
       OR entity_id IN (SELECT id FROM pg_payment_records WHERE booking_id = ${bookingId}::uuid)
    ORDER BY approved_at
  `);

  const depositLedger = await db.execute(sql`
    SELECT * FROM deposit_ledger WHERE booking_id = ${bookingId}::uuid ORDER BY created_at
  `);

  const auditPg = await db.execute(sql`
    SELECT entity, entity_id::text, action, diff, created_at
    FROM audit_log
    WHERE entity = 'pg_payment_record'
      AND entity_id IN (SELECT id FROM pg_payment_records WHERE booking_id = ${bookingId}::uuid)
    ORDER BY created_at
  `);

  const auditPayment = await db.execute(sql`
    SELECT entity, entity_id::text, action, diff, created_at
    FROM audit_log
    WHERE entity = 'payment'
      AND entity_id IN (SELECT id FROM payments WHERE booking_id = ${bookingId}::uuid)
    ORDER BY created_at
  `);

  const auditBooking = await db.execute(sql`
    SELECT entity, entity_id::text, action, diff, created_at
    FROM audit_log
    WHERE entity = 'booking' AND entity_id = ${bookingId}::uuid
    ORDER BY created_at
  `);

  console.log(JSON.stringify(
    {
      booking: b,
      pg_payment_records: pgRecords,
      payments,
      payment_approval_allocations: allocations,
      deposit_ledger: depositLedger,
      audit_log_pg_payment_record: auditPg,
      audit_log_payment: auditPayment,
      audit_log_booking: auditBooking,
    },
    null,
    2,
  ));

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

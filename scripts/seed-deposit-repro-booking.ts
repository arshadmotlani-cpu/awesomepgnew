/* eslint-disable no-console */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';

const BOOKING_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CUSTOMER_ID = '11111111-1111-1111-1111-111111111111';

async function main() {
  await db.execute(sql`
    INSERT INTO bookings (
      id, booking_code, customer_id, status, duration_mode,
      subtotal_paise, discount_paise, tax_paise, total_paise, deposit_paise,
      deposit_due_paise, deposit_collection_status, pricing_snapshot, created_via
    ) VALUES (
      ${BOOKING_ID}::uuid,
      'E352',
      ${CUSTOMER_ID}::uuid,
      'confirmed',
      'monthly',
      1000000, 0, 0, 1350000, 350000,
      0, 'full',
      '{"perBed":[],"computedAt":"2026-01-01T00:00:00.000Z"}'::jsonb,
      'admin'
    )
    ON CONFLICT (id) DO UPDATE SET
      deposit_paise = 350000,
      total_paise = 1350000,
      deposit_due_paise = 0,
      deposit_collection_status = 'full',
      updated_at = now()
  `);

  await db.execute(sql`DELETE FROM deposit_ledger WHERE booking_id = ${BOOKING_ID}::uuid`);
  await db.execute(sql`
    INSERT INTO deposit_ledger (
      id, booking_id, customer_id, entry_kind, amount_paise, reason, created_at
    ) VALUES (
      gen_random_uuid(),
      ${BOOKING_ID}::uuid,
      ${CUSTOMER_ID}::uuid,
      'collected',
      350000,
      'seed collected',
      now()
    )
  `);

  console.log('Seeded booking', BOOKING_ID, 'code E352');
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

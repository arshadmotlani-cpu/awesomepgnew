#!/usr/bin/env npx tsx
/**
 * Female PG production ops — electricity + July rent.
 *
 *   DOTENV_CONFIG_PATH=.env.production.runtime npx tsx scripts/ops-female-pg-bills.ts
 *   DOTENV_CONFIG_PATH=.env.production.runtime npx tsx scripts/ops-female-pg-bills.ts --execute
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { createElectricityBill } from '@/src/services/electricityBilling';
import { ensureMonthlyRentInvoice } from '@/src/services/rentInvoices';
import { getBookingFinancialAccount } from '@/src/services/residentFinancialEngine';

const BILLING_MONTH = '2026-07-01';
const JULY_RENT_PAISE = 500_000;
const UNITS_CONSUMED = 248;
const RATE_PER_UNIT_PAISE = 1_500;
const EXECUTE = process.argv.includes('--execute');

async function main() {
  const [pg] = await db.execute<{ id: string; name: string }>(sql`
    SELECT id::text AS id, name FROM pgs
    WHERE name ILIKE '%female%' AND name ILIKE '%central%'
    LIMIT 1
  `);
  if (!pg) {
    console.error('Female PG not found');
    process.exit(1);
  }
  console.log(`PG: ${pg.name} (${pg.id})`);

  const [room] = await db.execute<{ id: string; room_number: string }>(sql`
    SELECT r.id::text AS id, r.room_number
    FROM rooms r
    INNER JOIN floors f ON f.id = r.floor_id
    WHERE f.pg_id = ${pg.id}::uuid AND r.room_number = '402'
    LIMIT 1
  `);
  if (!room) {
    console.error('Room 402 not found');
    process.exit(1);
  }

  const residents = await db.execute<{
    booking_id: string;
    customer_id: string;
    customer_name: string;
    bed_code: string;
  }>(sql`
    SELECT b.id::text AS booking_id, c.id::text AS customer_id, c.full_name AS customer_name, bd.bed_code
    FROM bookings b
    INNER JOIN customers c ON c.id = b.customer_id
    INNER JOIN bed_reservations br ON br.booking_id = b.id
      AND br.status = 'active' AND br.kind = 'primary'
      AND CURRENT_DATE <@ br.stay_range
    INNER JOIN beds bd ON bd.id = br.bed_id
    WHERE bd.room_id = ${room.id}::uuid AND b.status = 'confirmed'
    ORDER BY bd.bed_code
  `);

  console.log(`\nActive residents in room ${room.room_number}: ${residents.length}`);
  for (const r of residents as {
    booking_id: string;
    customer_id: string;
    customer_name: string;
    bed_code: string;
  }[]) {
    const account = await getBookingFinancialAccount({
      bookingId: r.booking_id,
      customerId: r.customer_id,
      customerName: r.customer_name,
      customerPhone: '',
      bookingCode: '',
      pgId: pg.id,
      pgName: pg.name,
      roomNumber: room.room_number,
      depositPaise: 0,
      depositDuePaise: 0,
    });
    console.log(
      `  ${r.customer_name} (${r.bed_code}) · deposit required ${account.deposit.requiredPaise} paid ${account.deposit.paidPaise} due ${account.deposit.outstandingPaise}`,
    );
  }

  const grossPaise = UNITS_CONSUMED * RATE_PER_UNIT_PAISE;
  const perResident = Math.floor(grossPaise / Math.max(1, residents.length));
  console.log(`\nElectricity: ${UNITS_CONSUMED} units × ₹${RATE_PER_UNIT_PAISE / 100} = ₹${grossPaise / 100}`);
  console.log(`Equal share (~${residents.length} residents): ₹${perResident / 100} each`);

  if (!EXECUTE) {
    console.log('\n[dry-run] Pass --execute to create bill + July rent invoices');
    await closeDb();
    return;
  }

  const prevReading = 5000;
  const currReading = prevReading + UNITS_CONSUMED;
  const billResult = await createElectricityBill({
    roomId: room.id,
    billingMonth: BILLING_MONTH,
    previousReadingUnits: prevReading,
    currentReadingUnits: currReading,
    ratePerUnitPaise: RATE_PER_UNIT_PAISE,
    allowPreviousReadingOverride: true,
  });

  if (!billResult.ok) {
    console.error('Electricity bill failed:', billResult);
    process.exit(1);
  }
  console.log(`\n✓ Electricity bill created: ${billResult.billId} · ${billResult.invoiceCount} invoice(s)`);

  for (const r of residents as {
    booking_id: string;
    customer_id: string;
    customer_name: string;
    bed_code: string;
  }[]) {
    const rentResult = await ensureMonthlyRentInvoice({
      bookingId: r.booking_id,
      billingMonth: BILLING_MONTH,
      amountPaise: JULY_RENT_PAISE,
    });
    if (!rentResult.ok) {
      console.error(`✗ July rent for ${r.customer_name}: ${rentResult.error}`);
    } else {
      console.log(
        `✓ July rent ${r.customer_name}: ${rentResult.invoiceNumber} (${rentResult.created ? 'created' : 'exists'})`,
      );
    }
  }

  console.log('\nDone. Run verify-my-stay-bills-cert.ts to certify portal visibility.');
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});

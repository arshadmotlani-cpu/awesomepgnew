/* eslint-disable no-console */
/**
 * Phase 5.5 — verify electricity bill creation + split.
 *
 *   1. Pick a room with ≥2 beds. Create 2 monthly bookings on 2 different
 *      beds in that room + 1 daily booking on a 3rd bed (sentinel for
 *      "exclude non-monthly").
 *   2. createElectricityBill() with 150 units × ₹10/unit = ₹1,500 total.
 *   3. Assert monthlyOccupantCount == 2 (NOT 3 — daily excluded).
 *   4. Assert perResidentPaise == ₹750 (1500 / 2).
 *   5. Assert exactly 2 electricity_invoices rows were created.
 *   6. Rerun createElectricityBill() — assert already_exists (idempotent).
 *
 * Spec example: 150 Units × ₹10 = ₹1,500; 2 monthly residents pay ₹750 each.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import {
  beds,
  electricityInvoices,
} from '../src/db/schema';
import { createBooking } from '../src/services/booking';
import { recordPaymentSuccess } from '../src/services/bookingLifecycle';
import { createElectricityBill } from '../src/services/electricityBilling';
import { isBedAvailable } from '../src/services/availability';
import { firstOfMonth } from '../src/services/billing';

function ok(label: string) { console.log(`  \u2713 ${label}`); }
function fail(label: string, extra?: unknown): never {
  console.error(`  \u2717 ${label}`);
  if (extra !== undefined) console.error('    ', extra);
  process.exit(1);
}

async function pickRoomAndBeds(start: Date, end: Date): Promise<{ roomId: string; bedIds: string[] }> {
  // We need a room where:
  //   (a) we have ≥ 3 beds to use for the 2 monthly + 1 daily bookings, AND
  //   (b) ALL OTHER beds in the same room are also free for the test
  //       window — otherwise lingering monthly bookings from previous runs
  //       on those other beds would inflate `monthlyOccupantCount` and
  //       break the spec assertion of exactly 2 occupants.
  const allBeds = await db
    .select({ id: beds.id, roomId: beds.roomId })
    .from(beds)
    .where(eq(beds.status, 'available'));

  const byRoom = new Map<string, string[]>();
  for (const b of allBeds) {
    const arr = byRoom.get(b.roomId) ?? [];
    arr.push(b.id);
    byRoom.set(b.roomId, arr);
  }
  for (const [roomId, bedIds] of byRoom) {
    if (bedIds.length < 3) continue;
    let allFree = true;
    for (const bid of bedIds) {
      if (!(await isBedAvailable({ bedId: bid, startDate: start, endDate: end }))) {
        allFree = false;
        break;
      }
    }
    if (allFree) return { roomId, bedIds: bedIds.slice(0, 3) };
  }
  return fail('no room with ALL beds free for the test window');
}

async function main() {
  console.log('Phase 5.5 verification — electricity split');

  const today = new Date();
  const jitter = Math.floor(Math.random() * 365);
  const start = new Date(today.getTime() + (60 + jitter) * 86400_000);
  const end = new Date(start.getTime() + 62 * 86400_000); // 2 months
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const { roomId, bedIds } = await pickRoomAndBeds(start, end);
  ok(`picked room ${roomId.slice(0, 8)} with beds ${bedIds.map((b) => b.slice(0, 6)).join(', ')}`);

  console.log('\n[1] create 2 MONTHLY + 1 DAILY booking in the same room');
  const monthly1 = await createBooking({
    bedIds: [bedIds[0]],
    startDate: fmt(start),
    endDate: fmt(end),
    durationMode: 'monthly',
    customer: {
      fullName: 'Phase5.5 EleBot1',
      email: 'phase55-elebot1@example.com',
      phone: '+919999000601',
      gender: 'other',
    },
  });
  if (!monthly1.ok) fail('createBooking monthly1 failed', monthly1);
  await recordPaymentSuccess({
    provider: 'mock',
    providerPaymentId: `verify_ele_pay1_${Date.now()}`,
    amountPaise: monthly1.totalPaise,
    bookingCode: monthly1.bookingCode,
  });

  const monthly2 = await createBooking({
    bedIds: [bedIds[1]],
    startDate: fmt(start),
    endDate: fmt(end),
    durationMode: 'monthly',
    customer: {
      fullName: 'Phase5.5 EleBot2',
      email: 'phase55-elebot2@example.com',
      phone: '+919999000602',
      gender: 'other',
    },
  });
  if (!monthly2.ok) fail('createBooking monthly2 failed', monthly2);
  await recordPaymentSuccess({
    provider: 'mock',
    providerPaymentId: `verify_ele_pay2_${Date.now()}`,
    amountPaise: monthly2.totalPaise,
    bookingCode: monthly2.bookingCode,
  });

  const daily = await createBooking({
    bedIds: [bedIds[2]],
    startDate: fmt(start),
    endDate: fmt(new Date(start.getTime() + 5 * 86400_000)), // 5 day stay overlapping the billing month
    durationMode: 'daily',
    customer: {
      fullName: 'Phase5.5 EleBotDaily',
      email: 'phase55-eledaily@example.com',
      phone: '+919999000603',
      gender: 'other',
    },
  });
  if (!daily.ok) fail('createBooking daily failed', daily);
  await recordPaymentSuccess({
    provider: 'mock',
    providerPaymentId: `verify_ele_pay3_${Date.now()}`,
    amountPaise: daily.totalPaise,
    bookingCode: daily.bookingCode,
  });
  ok(`bookings ${monthly1.bookingCode}, ${monthly2.bookingCode} (monthly) + ${daily.bookingCode} (daily) all confirmed`);

  console.log('\n[2] createElectricityBill — readings 1500 → 1650 (150 units) × ₹10');
  const billingMonth = firstOfMonth(start);
  const bill = await createElectricityBill({
    roomId,
    billingMonth,
    previousReadingUnits: 1500,
    currentReadingUnits: 1650,
    ratePerUnitPaise: 1000, // ₹10
    notes: 'Phase 5.5 verify-electricity-split',
  });
  if (!bill.ok) fail('createElectricityBill failed', bill);
  if (bill.unitsConsumed !== 150) {
    fail(`expected unitsConsumed=150, got ${bill.unitsConsumed}`, bill);
  }
  ok(`bill ${bill.billId.slice(0, 8)} created for ${billingMonth}, units=${bill.unitsConsumed}, due ${bill.dueDate}`);

  console.log('\n[3] assert occupant count = 2 (daily excluded)');
  if (bill.monthlyOccupantCount !== 2) {
    fail(`expected monthlyOccupantCount=2, got ${bill.monthlyOccupantCount}`, bill);
  }
  ok(`monthlyOccupantCount=${bill.monthlyOccupantCount}`);

  console.log('\n[4] assert ₹750 per resident, ₹0 rounding remainder');
  if (bill.perResidentPaise !== 75000) {
    fail(`expected perResidentPaise=75000 (₹750), got ${bill.perResidentPaise}`);
  }
  if (bill.roundingRemainderPaise !== 0) {
    fail(`expected remainder=0, got ${bill.roundingRemainderPaise}`);
  }
  ok(`perResident=₹${bill.perResidentPaise / 100}, remainder=${bill.roundingRemainderPaise}`);

  console.log('\n[5] assert exactly 2 electricity_invoices were created');
  if (bill.invoiceIds.length !== 2) {
    fail(`expected 2 invoices, got ${bill.invoiceIds.length}`, bill);
  }
  const invoices = await db
    .select()
    .from(electricityInvoices)
    .where(eq(electricityInvoices.electricityBillId, bill.billId));
  if (invoices.length !== 2) {
    fail(`db has ${invoices.length} invoice rows, expected 2`, invoices);
  }
  for (const inv of invoices) {
    if (inv.amountPaise !== 75000) {
      fail(`invoice ${inv.invoiceNumber} expected ₹750, got ₹${inv.amountPaise / 100}`);
    }
  }
  ok('2 electricity invoices each charged ₹750');

  console.log('\n[6] re-creating bill for same (room, month) is rejected');
  const duplicate = await createElectricityBill({
    roomId,
    billingMonth,
    previousReadingUnits: 0,
    currentReadingUnits: 200,
    ratePerUnitPaise: 1000,
  });
  if (duplicate.ok) fail('expected already_exists, got ok', duplicate);
  if (duplicate.kind !== 'already_exists') {
    fail(`expected kind=already_exists, got ${duplicate.kind}`, duplicate);
  }
  ok('duplicate (room, month) rejected with already_exists');

  console.log('\nAll electricity-split assertions passed.');
}

main()
  .catch((err) => {
    console.error('verify-electricity-split failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });

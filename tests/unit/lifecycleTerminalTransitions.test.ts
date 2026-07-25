import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

test('processDueBedReserveConversions calls convertBedReserveToMonthlyStay', () => {
  const src = read('src/services/bedReserve.ts');
  const block = src.slice(
    src.indexOf('export async function processDueBedReserveConversions'),
    src.indexOf('export async function expireStaleBedReserves'),
  );
  assert.match(block, /convertBedReserveToMonthlyStay/);
  assert.doesNotMatch(block, /converted: 0/);
});

test('terminal paths cancel bed_reserve_holds', () => {
  assert.match(read('src/services/supersededBookingLifecycle.ts'), /bedReserveHolds/);
  assert.match(read('src/services/bookingLifecycle.ts'), /bedReserveHolds/);
  assert.match(read('src/lib/bookingApproval.ts'), /reconcileBookingOccupancy/);
});

test('occupancySync heals under_review orphans on terminal bookings', () => {
  const src = read('src/lib/occupancySync.ts');
  assert.match(src, /under_review/);
});

test('occupancySync casts terminal reservation status to reservation_status enum', () => {
  const src = read('src/lib/occupancySync.ts');
  assert.match(src, /'completed'::reservation_status/);
  assert.match(src, /'cancelled'::reservation_status/);
  const updates = src.match(/UPDATE bed_reservations br/g) ?? [];
  assert.ok(updates.length >= 2, 'expected both orphan and terminal booking UPDATE helpers');
});

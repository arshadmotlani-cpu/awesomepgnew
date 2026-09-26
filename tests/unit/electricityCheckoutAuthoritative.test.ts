/**
 * Checkout electricity — authoritative pipeline tests.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { activeDaysInPeriod, allocateRoomElectricityCheckout } from '@/src/lib/checkout/roomElectricityAllocation';

test('337→479 @ ₹16: room total ₹2,272 and collections reconcile', () => {
  const totalBillPaise = 142 * 16 * 100; // 227_200
  assert.equal(totalBillPaise, 227_200);

  const collected = new Map<string, number>([
    ['other-a', 80_000],
    ['other-b', 59_100],
  ]);
  assert.equal([...collected.values()].reduce((s, n) => s + n, 0), 139_100);

  const result = allocateRoomElectricityCheckout({
    billingMonth: '2026-09-01',
    periodStart: '2026-09-01',
    periodEndExclusive: '2026-10-01',
    totalBillPaise,
    unitsConsumed: 142,
    occupants: [
      {
        bookingId: 'b-a',
        customerId: 'other-a',
        customerName: 'A',
        stayStart: '2026-09-01',
        stayEndExclusive: '2026-10-01',
      },
      {
        bookingId: 'b-b',
        customerId: 'other-b',
        customerName: 'B',
        stayStart: '2026-09-01',
        stayEndExclusive: '2026-10-01',
      },
      {
        bookingId: 'b-out',
        customerId: 'checking-out',
        customerName: 'Checking out',
        stayStart: '2026-09-01',
        stayEndExclusive: '2026-10-01',
      },
    ],
    collectedByCustomerId: collected,
    currentCustomerId: 'checking-out',
  });

  assert.equal(result.alreadyCollectedPaise, 139_100);
  assert.equal(result.remainingToRecoverPaise, 88_100);
  assert.equal(result.otherResidentsCollectedPaise, 139_100);
  assert.equal(result.currentResidentCollectedPaise, 0);
  assert.ok(result.currentResidentSharePaise > 0);
  assert.ok(result.currentResidentSharePaise <= result.remainingToRecoverPaise);
});

test('mid-cycle vacant interval — vacant days do not create a payer', () => {
  const periodStart = '2026-02-25';
  const periodEnd = '2026-03-26';
  assert.equal(
    activeDaysInPeriod('2026-03-15', '2026-03-20', periodStart, periodEnd),
    5,
  );
  assert.equal(
    activeDaysInPeriod('2026-03-20', '2026-03-25', periodStart, periodEnd),
    5,
  );

  const totalBillPaise = 100_000;
  const result = allocateRoomElectricityCheckout({
    billingMonth: '2026-03-01',
    periodStart,
    periodEndExclusive: periodEnd,
    totalBillPaise,
    occupants: [
      {
        bookingId: 'a',
        customerId: 'resident-a',
        customerName: 'A',
        stayStart: '2026-02-25',
        stayEndExclusive: '2026-03-15',
      },
      {
        bookingId: 'b',
        customerId: 'resident-b',
        customerName: 'B',
        stayStart: '2026-03-20',
        stayEndExclusive: '2026-03-26',
      },
      {
        bookingId: 'c',
        customerId: 'resident-c',
        customerName: 'C',
        stayStart: '2026-02-25',
        stayEndExclusive: '2026-03-26',
      },
    ],
    collectedByCustomerId: new Map(),
    currentCustomerId: 'resident-b',
  });

  const sumFair = result.occupants.reduce((s, o) => s + o.fairSharePaise, 0);
  assert.ok(Math.abs(sumFair - totalBillPaise) <= result.occupants.length);
  assert.ok(result.occupants.find((o) => o.customerId === 'resident-b')!.fairSharePaise > 0);
  assert.equal(
    result.occupants.find((o) => o.customerId === 'resident-a')!.occupancyDays,
    activeDaysInPeriod('2026-02-25', '2026-03-15', periodStart, periodEnd),
  );
});

test('partial payment reduces only that resident remaining due', () => {
  const totalBillPaise = 90_000;
  const result = allocateRoomElectricityCheckout({
    billingMonth: '2026-07-01',
    periodStart: '2026-07-01',
    periodEndExclusive: '2026-08-01',
    totalBillPaise,
    occupants: [
      {
        bookingId: '1',
        customerId: 'current',
        customerName: 'Current',
        stayStart: '2026-07-01',
        stayEndExclusive: '2026-08-01',
      },
      {
        bookingId: '2',
        customerId: 'other',
        customerName: 'Other',
        stayStart: '2026-07-01',
        stayEndExclusive: '2026-08-01',
      },
    ],
    collectedByCustomerId: new Map([['current', 20_000]]),
    currentCustomerId: 'current',
  });

  assert.equal(result.currentResidentCollectedPaise, 20_000);
  assert.equal(result.currentResidentFairSharePaise, 45_000);
  assert.ok(result.currentResidentSharePaise > 0);
  assert.ok(result.currentResidentSharePaise < 45_000);
  assert.equal(result.currentResidentSharePaise + 20_000, 45_000);
});

test('date-aware 3→2: allocation input uses billing-month bed count via engine (contract)', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/electricityBilling.ts'), 'utf8');
  assert.match(src, /resolveEffectiveBedCountForRoom\(input\.roomId, billingMonth\)/);
});

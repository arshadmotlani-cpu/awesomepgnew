import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateRoomElectricityCheckout } from '@/src/lib/checkout/roomElectricityAllocation';
import { buildCollectedByCustomerIdForCheckout } from '@/src/services/roomElectricityCheckout';

const JUNE = {
  billingMonth: '2026-07-01',
  periodStart: '2026-07-01',
  periodEndExclusive: '2026-08-01',
};

const threeOccupants = [
  {
    bookingId: 'b1',
    customerId: 'prior',
    customerName: 'Prior Resident',
    stayStart: '2026-07-01',
    stayEndExclusive: '2026-07-20',
  },
  {
    bookingId: 'b2',
    customerId: 'current',
    customerName: 'Current Resident',
    stayStart: '2026-07-01',
    stayEndExclusive: '2026-08-01',
  },
  {
    bookingId: 'b3',
    customerId: 'other',
    customerName: 'Other Resident',
    stayStart: '2026-07-01',
    stayEndExclusive: '2026-08-01',
  },
];

test('7 — multi-resident room ledger counts prior resident collection', () => {
  const collected = buildCollectedByCustomerIdForCheckout({
    contributions: [],
    ledgerRows: [
      {
        customerId: 'prior',
        amountPaise: 16_800,
        checkoutSettlementId: 'settlement-prior',
      },
    ],
  });

  const result = allocateRoomElectricityCheckout({
    ...JUNE,
    totalBillPaise: 33_600,
    occupants: threeOccupants,
    collectedByCustomerId: collected,
    currentCustomerId: 'current',
  });

  assert.equal(result.alreadyCollectedPaise, 16_800);
  assert.equal(result.remainingToRecoverPaise, 16_800);
});

test('8 — applied-status ledger rows are included via buildCollectedByCustomerIdForCheckout', () => {
  const collected = buildCollectedByCustomerIdForCheckout({
    contributions: [],
    ledgerRows: [
      {
        customerId: 'prior',
        amountPaise: 16_800,
        checkoutSettlementId: 'settlement-applied',
      },
    ],
  });

  assert.equal(collected.get('prior'), 16_800);
});

test('9 — refund checkout does not erase prior room collection when excluded settlement differs', () => {
  const collected = buildCollectedByCustomerIdForCheckout({
    contributions: [
      {
        customerId: 'prior',
        amountPaise: 16_800,
        checkoutSettlementId: 'settlement-prior',
      },
    ],
    ledgerRows: [],
    excludeCheckoutSettlementId: 'settlement-current',
  });

  assert.equal(collected.get('prior'), 16_800);
  assert.equal(collected.get('current'), undefined);
});

test('10 — no double collection for resident already marked collected', () => {
  const collected = new Map<string, number>([['prior', 16_800]]);
  const result = allocateRoomElectricityCheckout({
    ...JUNE,
    totalBillPaise: 33_600,
    occupants: threeOccupants,
    collectedByCustomerId: collected,
    currentCustomerId: 'prior',
  });

  assert.equal(result.currentResidentSharePaise, 0);
  assert.equal(result.occupants.find((o) => o.customerId === 'prior')?.settlementStatus, 'paid');
});

test('11 — new resident sees remaining balance after prior share collected', () => {
  const collected = new Map<string, number>([['prior', 16_800]]);
  const result = allocateRoomElectricityCheckout({
    ...JUNE,
    totalBillPaise: 33_600,
    occupants: threeOccupants,
    collectedByCustomerId: collected,
    currentCustomerId: 'current',
  });

  assert.equal(result.remainingToRecoverPaise, 16_800);
  assert.ok(result.currentResidentSharePaise > 0);
  assert.ok(result.currentResidentSharePaise < 16_800);
});

test('12 — period isolation: collections from another month are not mixed in allocation input', () => {
  const juneCollected = new Map<string, number>([['prior', 10_000]]);
  const julyResult = allocateRoomElectricityCheckout({
    billingMonth: '2026-08-01',
    periodStart: '2026-08-01',
    periodEndExclusive: '2026-09-01',
    totalBillPaise: 30_000,
    occupants: [
      {
        bookingId: 'b2',
        customerId: 'current',
        customerName: 'Current Resident',
        stayStart: '2026-08-01',
        stayEndExclusive: '2026-09-01',
      },
    ],
    collectedByCustomerId: new Map(),
    currentCustomerId: 'current',
  });

  const juneResult = allocateRoomElectricityCheckout({
    ...JUNE,
    totalBillPaise: 33_600,
    occupants: threeOccupants,
    collectedByCustomerId: juneCollected,
    currentCustomerId: 'current',
  });

  assert.equal(julyResult.alreadyCollectedPaise, 0);
  assert.equal(julyResult.currentResidentSharePaise, 30_000);
  assert.equal(juneResult.alreadyCollectedPaise, 10_000);
});

test('13 — contributions SSOT preferred over ledger fallback', () => {
  const collected = buildCollectedByCustomerIdForCheckout({
    contributions: [
      {
        customerId: 'prior',
        amountPaise: 16_800,
        checkoutSettlementId: 'settlement-prior',
      },
    ],
    ledgerRows: [
      {
        customerId: 'prior',
        amountPaise: 99_999,
        checkoutSettlementId: 'stale-ledger',
      },
    ],
  });

  assert.equal(collected.get('prior'), 16_800);
});

test('15 — APG-2026-0083: Govind ₹112 collected reduces Bhuwan share on ₹336 room bill', () => {
  const collected = new Map<string, number>([['govind', 11_200]]);
  const result = allocateRoomElectricityCheckout({
    billingMonth: '2026-08-01',
    periodStart: '2026-08-01',
    periodEndExclusive: '2026-08-16',
    totalBillPaise: 33_600,
    occupants: [
      {
        bookingId: 'b-rishik',
        customerId: 'rishik',
        customerName: 'Rishik',
        stayStart: '2026-06-01',
        stayEndExclusive: '2026-09-01',
      },
      {
        bookingId: 'b-bhuwan',
        customerId: 'bhuwan',
        customerName: 'Bhuwan',
        stayStart: '2026-07-21',
        stayEndExclusive: '2026-08-16',
      },
    ],
    collectedByCustomerId: collected,
    currentCustomerId: 'bhuwan',
  });

  assert.equal(result.alreadyCollectedPaise, 11_200);
  assert.equal(result.remainingToRecoverPaise, 22_400);
  assert.ok(result.currentResidentSharePaise > 0);
  assert.ok(result.currentResidentSharePaise < 16_800);
});

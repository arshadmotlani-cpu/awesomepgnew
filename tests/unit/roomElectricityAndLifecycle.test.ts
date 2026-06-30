import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeDaysInPeriod,
  allocateRoomElectricityCheckout,
} from '@/src/lib/checkout/roomElectricityAllocation';
import {
  isActiveCheckoutSettlement,
  resolveResidentQueueWinner,
} from '@/src/lib/residents/residentLifecycleState';
import type { ResidentOpsQueueItem } from '@/src/lib/residents/residentOperationsDashboard';

test('equal full-month occupants split room bill evenly', () => {
  const result = allocateRoomElectricityCheckout({
    billingMonth: '2026-06-01',
    periodStart: '2026-06-01',
    periodEndExclusive: '2026-07-01',
    totalBillPaise: 40_000,
    unitsConsumed: 25,
    occupants: [
      {
        bookingId: 'b1',
        customerId: 'a',
        customerName: 'Resident A',
        stayStart: '2026-06-01',
        stayEndExclusive: '2026-07-01',
      },
      {
        bookingId: 'b2',
        customerId: 'b',
        customerName: 'Resident B',
        stayStart: '2026-06-01',
        stayEndExclusive: '2026-07-01',
      },
    ],
    collectedByCustomerId: new Map(),
    currentCustomerId: 'a',
  });

  assert.equal(result.totalBillPaise, 40_000);
  assert.equal(result.currentResidentSharePaise, 20_000);
  assert.equal(result.occupants.find((o) => o.customerId === 'b')?.checkoutSharePaise, 20_000);
});

test('partial stays allocate by occupancy days', () => {
  const result = allocateRoomElectricityCheckout({
    billingMonth: '2026-06-01',
    periodStart: '2026-06-01',
    periodEndExclusive: '2026-07-01',
    totalBillPaise: 30_000,
    occupants: [
      {
        bookingId: 'b1',
        customerId: 'a',
        customerName: 'A',
        stayStart: '2026-06-01',
        stayEndExclusive: '2026-07-01',
      },
      {
        bookingId: 'b2',
        customerId: 'b',
        customerName: 'B',
        stayStart: '2026-06-15',
        stayEndExclusive: '2026-07-01',
      },
    ],
    collectedByCustomerId: new Map(),
    currentCustomerId: 'b',
  });

  const aDays = activeDaysInPeriod('2026-06-01', '2026-07-01', '2026-06-01', '2026-07-01');
  const bDays = activeDaysInPeriod('2026-06-15', '2026-07-01', '2026-06-01', '2026-07-01');
  assert.equal(aDays, 30);
  assert.equal(bDays, 16);
  const splitTotal = result.occupants.reduce((sum, line) => sum + line.checkoutSharePaise, 0);
  assert.ok(splitTotal >= 29_999 && splitTotal <= 30_000);
  assert.ok(result.currentResidentSharePaise > 0);
  assert.ok(result.currentResidentSharePaise < 30_000);
});

test('already collected amount reduces remaining pool for unsettled residents', () => {
  const collected = new Map<string, number>([['a', 18_000]]);
  const result = allocateRoomElectricityCheckout({
    billingMonth: '2026-06-01',
    periodStart: '2026-06-01',
    periodEndExclusive: '2026-07-01',
    totalBillPaise: 40_000,
    occupants: [
      {
        bookingId: 'b1',
        customerId: 'a',
        customerName: 'A',
        stayStart: '2026-06-01',
        stayEndExclusive: '2026-07-01',
      },
      {
        bookingId: 'b2',
        customerId: 'b',
        customerName: 'B',
        stayStart: '2026-06-01',
        stayEndExclusive: '2026-07-01',
      },
      {
        bookingId: 'b3',
        customerId: 'c',
        customerName: 'C',
        stayStart: '2026-06-01',
        stayEndExclusive: '2026-07-01',
      },
    ],
    collectedByCustomerId: collected,
    currentCustomerId: 'b',
  });

  assert.equal(result.alreadyCollectedPaise, 18_000);
  assert.equal(result.remainingToRecoverPaise, 22_000);
  assert.equal(result.currentResidentSharePaise, 11_000);
  assert.equal(result.occupants.find((o) => o.customerId === 'c')?.checkoutSharePaise, 11_000);
});

test('active checkout suppresses bed assignment and kyc queue items', () => {
  const items: ResidentOpsQueueItem[] = [
    {
      id: 'bed-1',
      category: 'bed_assignment',
      filterBucket: 'bed_unassigned',
      customerId: 'cust-1',
      residentName: 'Test',
      pgName: null,
      roomNumber: null,
      bedCode: null,
      issue: 'Awaiting bed',
      nextAction: 'Assign bed',
      primaryActionLabel: 'Assign bed',
      primaryHref: '/admin/beds',
      sortPriority: 0,
      bookingId: 'b1',
      kycSubmissionId: null,
      tenancyStatus: 'unassigned',
      kycStatus: 'approved',
    },
    {
      id: 'moveout-1',
      category: 'move_out',
      filterBucket: 'move_out',
      customerId: 'cust-1',
      residentName: 'Test',
      pgName: 'PG',
      roomNumber: '102',
      bedCode: 'A',
      issue: 'Checkout',
      nextAction: 'Review checkout',
      primaryActionLabel: 'Continue',
      primaryHref: '/admin/checkout-settlements/s1',
      sortPriority: 1,
      bookingId: 'b1',
      kycSubmissionId: null,
      tenancyStatus: 'vacating',
      kycStatus: null,
    },
  ];

  const winner = resolveResidentQueueWinner({
    customerId: 'cust-1',
    items,
    settlement: {
      status: 'awaiting_admin_review',
    } as Parameters<typeof resolveResidentQueueWinner>[0]['settlement'],
  });

  assert.equal(winner?.category, 'move_out');
  assert.ok(isActiveCheckoutSettlement({ status: 'awaiting_admin_review' }));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertBillGenerationSafe,
  collectionPercentage,
  validateElectricityLedgerView,
} from '@/src/lib/billing/electricityValidation';
import { computeElectricityCollectionReconciliation } from '@/src/lib/billing/electricitySettlementLedgerReconciliation';
import type { ElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';

function sampleLedger(overrides: Partial<ElectricitySettlementLedgerView> = {}): ElectricitySettlementLedgerView {
  return {
    roomId: 'room-1',
    roomNumber: '102',
    pgName: 'Test PG',
    billingMonth: '2026-06-01',
    electricityBillId: 'bill-1',
    totalRoomBillPaise: 40_000,
    prepaidCreditAppliedPaise: 0,
    checkoutSettlementCredits: [],
    checkoutSettlementTotalPaise: 0,
    manualCredits: [],
    manualCreditsTotalPaise: 0,
    remainingRoomBalancePaise: 40_000,
    residentAllocations: [
      {
        invoiceId: 'inv-1',
        bookingId: 'b1',
        customerId: 'c1',
        customerName: 'A',
        invoiceNumber: 'E-1',
        amountPaise: 20_000,
        paidPaise: 0,
        status: 'pending',
        excludedBecauseCheckoutPaid: false,
      },
      {
        invoiceId: 'inv-2',
        bookingId: 'b2',
        customerId: 'c2',
        customerName: 'B',
        invoiceNumber: 'E-2',
        amountPaise: 20_000,
        paidPaise: 0,
        status: 'pending',
        excludedBecauseCheckoutPaid: false,
      },
    ],
    residentAllocationsTotalPaise: 40_000,
    roundingRemainderPaise: 0,
    collectedPaise: 0,
    outstandingPaise: 40_000,
    overCollectionPaise: 0,
    collectionPercentage: 0,
    reconciliationGapPaise: 0,
    isBalanced: true,
    isFullyCollected: false,
    hasReconciliationWarning: false,
    ...overrides,
  };
}

test('collection percentage caps at 100', () => {
  assert.equal(collectionPercentage(50_000, 40_000), 100);
  assert.equal(collectionPercentage(20_000, 40_000), 50);
});

test('over-collection is detected in collection reconciliation', () => {
  const result = computeElectricityCollectionReconciliation({
    totalRoomBillPaise: 40_000,
    collectedPaise: 45_000,
  });
  assert.equal(result.overCollectionPaise, 5_000);
  assert.equal(result.outstandingPaise, 0);
  assert.equal(result.isFullyCollected, false);
});

test('validateElectricityLedgerView flags reconciliation gap', () => {
  const result = validateElectricityLedgerView(
    sampleLedger({ isBalanced: false, reconciliationGapPaise: 500 }),
  );
  assert.equal(result.isValid, false);
  assert.ok(result.issues.some((i) => i.code === 'reconciliation_gap'));
});

test('validateElectricityLedgerView flags over-collection', () => {
  const result = validateElectricityLedgerView(
    sampleLedger({ overCollectionPaise: 1_000, hasReconciliationWarning: true }),
  );
  assert.equal(result.isValid, false);
  assert.ok(result.issues.some((i) => i.code === 'over_collection'));
});

test('assertBillGenerationSafe blocks unbalanced rooms', () => {
  const result = assertBillGenerationSafe({ reconciliationGapPaise: 100, overCollectionPaise: 0 });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /reconciliation gap/i);
});

test('assertBillGenerationSafe blocks over-collection', () => {
  const result = assertBillGenerationSafe({ reconciliationGapPaise: 0, overCollectionPaise: 500 });
  assert.equal(result.ok, false);
});

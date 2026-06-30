import test from 'node:test';
import assert from 'node:assert/strict';
import { computeElectricitySettlementLedgerReconciliation } from '@/src/lib/billing/electricitySettlementLedgerReconciliation';
import { allocateMonthlyElectricityInvoices } from '@/src/lib/billing/roomElectricityMonthlyAllocation';

test('settlement ledger reconciliation balances when credits + allocations + remainder equal bill', () => {
  const result = computeElectricitySettlementLedgerReconciliation({
    totalRoomBillPaise: 120_000,
    prepaidCreditAppliedPaise: 0,
    checkoutSettlementCreditsPaise: 22_400,
    manualCreditsPaise: 5_000,
    residentAllocationsPaise: 92_500,
    roundingRemainderPaise: 100,
  });
  assert.equal(result.remainingRoomBalancePaise, 92_600);
  assert.equal(result.reconciliationGapPaise, 0);
  assert.equal(result.isBalanced, true);
});

test('manual credits reduce splittable pool after checkout credits', () => {
  const checkout = new Map<string, number>([['a', 22_400]]);
  const result = allocateMonthlyElectricityInvoices({
    grossTotalPaise: 120_000,
    prepaidCreditPaise: 0,
    manualCreditPaise: 5_000,
    occupants: [
      { bookingId: 'b1', customerId: 'a', bedCount: 1, weight: 30 },
      { bookingId: 'b2', customerId: 'b', bedCount: 1, weight: 30 },
    ],
    checkoutCollectedByCustomerId: checkout,
    useProRata: false,
  });
  assert.equal(result.checkoutCreditAppliedPaise, 22_400);
  assert.equal(result.manualCreditAppliedPaise, 5_000);
  assert.equal(result.netSplittablePaise, 92_600);
  assert.equal(result.invoices.find((i) => i.customerId === 'b')?.amountPaise, 92_600);
});

test('reconciliation gap surfaces billing math errors', () => {
  const result = computeElectricitySettlementLedgerReconciliation({
    totalRoomBillPaise: 100_000,
    prepaidCreditAppliedPaise: 0,
    checkoutSettlementCreditsPaise: 10_000,
    manualCreditsPaise: 0,
    residentAllocationsPaise: 80_000,
    roundingRemainderPaise: 0,
  });
  assert.equal(result.reconciliationGapPaise, 10_000);
  assert.equal(result.isBalanced, false);
});

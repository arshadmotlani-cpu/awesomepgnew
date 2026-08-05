/**
 * Room OS Wave 1 — Electricity Engine unit tests.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  mapRoomBillingModeToSnapshot,
  resolveElectricityStatusFromLedger,
  resolveMeterReadingStateForMonth,
} from '@/src/roomOs/engines/electricity/resolveRoomElectricityFacts';
import type { ElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';

function ledger(partial: Partial<ElectricitySettlementLedgerView>): ElectricitySettlementLedgerView {
  return {
    roomId: 'room-1',
    roomNumber: '102',
    pgName: 'PG',
    billingMonth: '2026-07-01',
    electricityBillId: 'bill-1',
    totalRoomBillPaise: 100_000,
    prepaidCreditAppliedPaise: 0,
    checkoutSettlementCredits: [],
    checkoutSettlementTotalPaise: 0,
    manualCredits: [],
    manualCreditsTotalPaise: 0,
    remainingRoomBalancePaise: 0,
    residentAllocations: [],
    residentAllocationsTotalPaise: 100_000,
    roundingRemainderPaise: 0,
    collectedPaise: 100_000,
    outstandingPaise: 0,
    overCollectionPaise: 0,
    collectionPercentage: 100,
    reconciliationGapPaise: 0,
    isBalanced: true,
    isFullyCollected: true,
    hasReconciliationWarning: false,
    ...partial,
  };
}

describe('Room OS Wave 1 — Electricity', () => {
  test('billing mode maps per_bed/private_room → monthly', () => {
    assert.equal(mapRoomBillingModeToSnapshot('per_bed'), 'monthly');
    assert.equal(mapRoomBillingModeToSnapshot('private_room'), 'monthly');
    assert.equal(mapRoomBillingModeToSnapshot(null), 'unknown');
  });

  test('meter reading: finalized bill → current', () => {
    assert.equal(
      resolveMeterReadingStateForMonth({
        billingMonth: '2026-07-01',
        billForMonth: { currentReadingUnits: 1200 },
        lastBillingMonth: '2026-07-01',
        baselineSource: 'last_monthly_bill',
      }),
      'current',
    );
  });

  test('meter reading: no baseline → missing', () => {
    assert.equal(
      resolveMeterReadingStateForMonth({
        billingMonth: '2026-08-01',
        billForMonth: null,
        lastBillingMonth: null,
        baselineSource: 'none',
      }),
      'missing',
    );
  });

  test('meter reading: prior month only → stale for new month', () => {
    assert.equal(
      resolveMeterReadingStateForMonth({
        billingMonth: '2026-08-01',
        billForMonth: null,
        lastBillingMonth: '2026-07-01',
        baselineSource: 'last_monthly_bill',
      }),
      'stale',
    );
  });

  test('electricity status: no bill + missing meter', () => {
    const result = resolveElectricityStatusFromLedger(null, 'missing');
    assert.equal(result.status, 'awaiting_bill');
    assert.equal(result.reason, 'missing_meter');
  });

  test('nextElectricityBillStatus: stale meter without bill', async () => {
    const { resolveNextElectricityBillStatus } = await import(
      '@/src/roomOs/engines/electricity/resolveNextElectricityBillStatus'
    );
    assert.equal(
      resolveNextElectricityBillStatus({
        meterReadingState: 'stale',
        electricityStatus: 'awaiting_bill',
        hasActiveGenerationJob: false,
        ledger: null,
        asOf: '2026-08-05',
      }),
      'stale_meter',
    );
  });

  test('electricity status: balanced and fully collected → complete', () => {
    const result = resolveElectricityStatusFromLedger(ledger({}), 'current');
    assert.equal(result.status, 'complete');
  });

  test('electricity status: reconciliation gap → blocked', () => {
    const result = resolveElectricityStatusFromLedger(
      ledger({ isBalanced: false, reconciliationGapPaise: 500 }),
      'current',
    );
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'reconciliation_gap');
  });

  test('electricity status: outstanding share → pending_collection', () => {
    const result = resolveElectricityStatusFromLedger(
      ledger({ isFullyCollected: false, outstandingPaise: 67016 }),
      'current',
    );
    assert.equal(result.status, 'pending_collection');
  });
});

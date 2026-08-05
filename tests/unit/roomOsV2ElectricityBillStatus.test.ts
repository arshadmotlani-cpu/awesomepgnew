/**
 * Room Brain V2 — nextElectricityBillStatus unit tests.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  isRoomAwaitingElectricityBillGeneration,
  resolveNextElectricityBillStatus,
  residentElectricityPendingMessage,
} from '@/src/roomOs/engines/electricity/resolveNextElectricityBillStatus';
import type { ElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';

function ledger(partial: Partial<ElectricitySettlementLedgerView>): ElectricitySettlementLedgerView {
  return {
    roomId: 'room-1',
    roomNumber: '102',
    pgName: 'PG',
    billingMonth: '2026-08-01',
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
    collectedPaise: 0,
    outstandingPaise: 0,
    overCollectionPaise: 0,
    collectionPercentage: 0,
    reconciliationGapPaise: 0,
    isBalanced: true,
    isFullyCollected: false,
    hasReconciliationWarning: false,
    ...partial,
  };
}

describe('Room Brain V2 — nextElectricityBillStatus', () => {
  test('no bill + stale meter → stale_meter', () => {
    const status = resolveNextElectricityBillStatus({
      meterReadingState: 'stale',
      electricityStatus: 'awaiting_bill',
      hasActiveGenerationJob: false,
      ledger: null,
      asOf: '2026-08-05',
    });
    assert.equal(status, 'stale_meter');
    assert.equal(isRoomAwaitingElectricityBillGeneration(status), true);
  });

  test('no bill + missing meter → awaiting_meter', () => {
    const status = resolveNextElectricityBillStatus({
      meterReadingState: 'missing',
      electricityStatus: 'awaiting_bill',
      hasActiveGenerationJob: false,
      ledger: null,
      asOf: '2026-08-05',
    });
    assert.equal(status, 'awaiting_meter');
  });

  test('active generation job → bill_generating', () => {
    const status = resolveNextElectricityBillStatus({
      meterReadingState: 'stale',
      electricityStatus: 'awaiting_bill',
      hasActiveGenerationJob: true,
      ledger: null,
      asOf: '2026-08-05',
    });
    assert.equal(status, 'bill_generating');
  });

  test('bill exists, outstanding, past due → overdue', () => {
    const status = resolveNextElectricityBillStatus({
      meterReadingState: 'current',
      electricityStatus: 'pending_collection',
      hasActiveGenerationJob: false,
      ledger: ledger({ outstandingPaise: 67016, isFullyCollected: false }),
      earliestUnpaidDueDate: '2026-08-03',
      asOf: '2026-08-05',
    });
    assert.equal(status, 'overdue');
  });

  test('bill exists, outstanding, not past due → bill_ready', () => {
    const status = resolveNextElectricityBillStatus({
      meterReadingState: 'current',
      electricityStatus: 'pending_collection',
      hasActiveGenerationJob: false,
      ledger: ledger({ outstandingPaise: 67016, isFullyCollected: false }),
      earliestUnpaidDueDate: '2026-08-10',
      asOf: '2026-08-05',
    });
    assert.equal(status, 'bill_ready');
  });

  test('bill fully collected → paid', () => {
    const status = resolveNextElectricityBillStatus({
      meterReadingState: 'current',
      electricityStatus: 'complete',
      hasActiveGenerationJob: false,
      ledger: ledger({ isFullyCollected: true, outstandingPaise: 0 }),
      asOf: '2026-08-05',
    });
    assert.equal(status, 'paid');
    assert.equal(isRoomAwaitingElectricityBillGeneration(status), false);
  });

  test('resident pending message for stale meter mentions billing month', () => {
    const msg = residentElectricityPendingMessage('stale_meter', 'August 2026');
    assert.match(msg, /August 2026/);
    assert.match(msg, /admin records the room meter/i);
  });
});

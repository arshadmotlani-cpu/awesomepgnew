import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRoomElectricityAuditView } from '@/src/lib/billing/buildRoomElectricityAuditView';
import type { ElectricityBillCalculationBreakdown } from '@/src/lib/billing/electricityBillBreakdownTypes';
import type { ElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';

function sampleBreakdown(): ElectricityBillCalculationBreakdown {
  return {
    version: 1,
    roomNumber: '203',
    billingMonth: '2026-06-01',
    meter: {
      previousReadingUnits: 1250,
      currentReadingUnits: 1380,
      unitsConsumed: 130,
      ratePerUnitPaise: 1600,
      grossTotalPaise: 208_000,
    },
    adjustments: {
      prepaidCreditPaise: 0,
      prepaidCreditNote: null,
      checkoutCredits: [
        {
          customerId: 'c2',
          customerName: 'Resident B',
          amountPaise: 42_000,
          recoveredFromDepositPaise: 42_000,
          collectedDuringCheckoutPaise: 42_000,
        },
      ],
      manualCreditPaise: 0,
      totalDeductedPaise: 42_000,
    },
    previousContributions: [],
    remainingBillPaise: 166_000,
    useProRata: true,
    timeline: [
      {
        customerId: 'c1',
        customerName: 'Resident A',
        bookingId: 'b1',
        role: 'active',
        vacatedOn: null,
        stayStart: '2026-06-01',
        stayEnd: null,
        stayLabel: 'Entire month',
        activeDays: 30,
        calculatedSharePaise: 84_000,
        recoveredFromDepositPaise: 0,
        collectedDuringCheckoutPaise: 0,
        creditAppliedToRoomBillPaise: 0,
        monthlyInvoiceAmountPaise: 84_000,
        settlementStatus: 'active_billable',
        settlementStatusLabel: 'Your share this month',
      },
      {
        customerId: 'c2',
        customerName: 'Resident B',
        bookingId: 'b2',
        role: 'departed',
        vacatedOn: '2026-06-15',
        stayStart: '2026-06-01',
        stayEnd: '2026-06-15',
        stayLabel: '2026-06-01 → 2026-06-15',
        activeDays: 15,
        calculatedSharePaise: 42_000,
        recoveredFromDepositPaise: 42_000,
        collectedDuringCheckoutPaise: 42_000,
        creditAppliedToRoomBillPaise: 42_000,
        monthlyInvoiceAmountPaise: 0,
        settlementStatus: 'already_collected_at_checkout',
        settlementStatusLabel: 'Already collected during checkout',
      },
    ],
    generatedAt: '2026-06-30T12:00:00.000Z',
  };
}

function sampleLedger(): ElectricitySettlementLedgerView {
  return {
    roomId: 'room1',
    roomNumber: '203',
    pgName: 'Shanti Nagar',
    billingMonth: '2026-06-01',
    electricityBillId: 'bill1',
    totalRoomBillPaise: 208_000,
    prepaidCreditAppliedPaise: 0,
    checkoutSettlementCredits: [],
    checkoutSettlementTotalPaise: 42_000,
    manualCredits: [],
    manualCreditsTotalPaise: 0,
    remainingRoomBalancePaise: 166_000,
    residentAllocations: [
      {
        invoiceId: 'inv1',
        bookingId: 'b1',
        customerId: 'c1',
        customerName: 'Resident A',
        invoiceNumber: 'ELE-2026-06-0001',
        amountPaise: 84_000,
        paidPaise: 0,
        status: 'pending',
        excludedBecauseCheckoutPaid: false,
      },
      {
        invoiceId: null,
        bookingId: 'b2',
        customerId: 'c2',
        customerName: 'Resident B',
        invoiceNumber: null,
        amountPaise: 0,
        paidPaise: 42_000,
        status: 'paid',
        excludedBecauseCheckoutPaid: true,
      },
    ],
    residentAllocationsTotalPaise: 84_000,
    roundingRemainderPaise: 82_000,
    collectedPaise: 42_000,
    outstandingPaise: 84_000,
    overCollectionPaise: 0,
    collectionPercentage: 20,
    reconciliationGapPaise: 0,
    isBalanced: true,
    isFullyCollected: false,
    hasReconciliationWarning: false,
  };
}

describe('buildRoomElectricityAuditView', () => {
  it('merges breakdown timeline with ledger and validates sum', () => {
    const audit = buildRoomElectricityAuditView({
      breakdown: sampleBreakdown(),
      ledger: sampleLedger(),
      pgName: 'Shanti Nagar',
      distribution: [
        {
          invoiceId: 'inv1',
          invoiceNumber: 'ELE-2026-06-0001',
          bookingId: 'b1',
          customerFullName: 'Resident A',
          bedCode: '203-A',
          amountPaise: 84_000,
          status: 'pending',
          paidPaise: 0,
          unitsShare: 65,
          activeDays: 30,
        },
      ],
    });

    assert.equal(audit.residentRows.length, 2);
    assert.equal(audit.isBalanced, true);
    assert.equal(audit.sumAllocatedPaise, 84_000);
    assert.equal(audit.residentRows[0]!.currentOutstandingPaise, 84_000);
    assert.equal(audit.residentRows[1]!.previousCollectedPaise, 42_000);
    assert.equal(audit.residentRows[1]!.amountAllocatedPaise, 0);
    assert.equal(audit.roomSummary.roomNumber, '203');
    assert.equal(audit.roomSummary.pgName, 'Shanti Nagar');
    assert.equal(audit.roomSummary.billingPeriodStart, '2026-06-01');
    assert.equal(audit.residentRows[0]!.bedCode, '203-A');
    assert.equal(audit.residentRows[0]!.billingCycleDays, 30);
    assert.equal(audit.residentRows[0]!.occupancyPct, 100);
    assert.ok(audit.residentRows[0]!.timeline.length >= 2);
    assert.equal(
      audit.sumAllocatedPaise + audit.sumCreditsPaise + audit.roundingRemainderPaise,
      audit.grossTotalPaise,
    );
  });
});

/**
 * Resident electricity bill explanation — status mapping + SSOT composition.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ElectricityBillCalculationBreakdown } from '@/src/lib/billing/electricityBillBreakdownTypes';
import {
  buildResidentElectricityBillExplanation,
  residentElectricityParticipantStatus,
} from '@/src/lib/residents/residentElectricityBillExplanationPure';
import type { RoomElectricityResidentSettlementRow } from '@/src/roomOs/engines/electricity/buildRoomElectricitySettlement';

const timelineEntry = (
  overrides: Partial<ElectricityBillCalculationBreakdown['timeline'][number]> = {},
) => ({
  customerId: 'cust-dhruv',
  customerName: 'Dhruv',
  bookingId: 'booking-dhruv',
  role: 'active' as const,
  vacatedOn: null,
  stayStart: '2026-07-01',
  stayEnd: null,
  stayLabel: 'Entire month',
  activeDays: 31,
  calculatedSharePaise: 67_016,
  recoveredFromDepositPaise: 0,
  collectedDuringCheckoutPaise: 0,
  creditAppliedToRoomBillPaise: 0,
  monthlyInvoiceAmountPaise: 67_016,
  settlementStatus: 'active_billable' as const,
  settlementStatusLabel: 'Your share this month',
  ...overrides,
});

const settlementRow = (
  overrides: Partial<RoomElectricityResidentSettlementRow> = {},
): RoomElectricityResidentSettlementRow => ({
  customerId: 'cust-dhruv',
  customerName: 'Dhruv',
  bookingId: 'booking-dhruv',
  invoiceId: 'inv-dhruv',
  invoiceNumber: 'ELE-2026-07-0008',
  amountOwedPaise: 67_016,
  amountPaidPaise: 0,
  amountDeductedFromDepositPaise: 0,
  outstandingPaise: 67_016,
  lateFeePaise: 0,
  status: 'pending',
  lateFeeWaived: true,
  ...overrides,
});

describe('residentElectricityBillExplanation', () => {
  it('maps departed deposit recovery to Recovered from Deposit', () => {
    const status = residentElectricityParticipantStatus({
      timelineEntry: timelineEntry({
        customerId: 'cust-kunal',
        customerName: 'Kunal',
        role: 'departed',
        activeDays: 21,
        calculatedSharePaise: 32_533,
        recoveredFromDepositPaise: 32_533,
        monthlyInvoiceAmountPaise: 0,
        settlementStatus: 'recovered_from_deposit',
        settlementStatusLabel: '✓ Recovered from deposit',
      }),
      settlement: settlementRow({
        customerId: 'cust-kunal',
        customerName: 'Kunal',
        amountOwedPaise: 32_533,
        amountPaidPaise: 32_533,
        amountDeductedFromDepositPaise: 32_533,
        outstandingPaise: 0,
        status: 'settled',
      }),
    });
    assert.equal(status, 'Recovered from Deposit');
  });

  it('maps outstanding share to Pending', () => {
    const status = residentElectricityParticipantStatus({
      timelineEntry: timelineEntry(),
      settlement: settlementRow(),
    });
    assert.equal(status, 'Pending');
  });

  it('maps fully paid share to Paid', () => {
    const status = residentElectricityParticipantStatus({
      timelineEntry: timelineEntry({
        settlementStatus: 'fully_settled',
        settlementStatusLabel: '✓ Fully settled',
      }),
      settlement: settlementRow({
        amountPaidPaise: 67_016,
        outstandingPaise: 0,
        status: 'settled',
      }),
    });
    assert.equal(status, 'Paid');
  });

  it('composes resident-safe explanation from room settlement SSOT', () => {
    const breakdown: ElectricityBillCalculationBreakdown = {
      version: 1,
      roomNumber: '102',
      billingMonth: '2026-07-01',
      meter: {
        previousReadingUnits: 100,
        currentReadingUnits: 196,
        unitsConsumed: 96,
        ratePerUnitPaise: 1_600,
        grossTotalPaise: 153_600,
      },
      adjustments: {
        prepaidCreditPaise: 0,
        prepaidCreditNote: null,
        checkoutCredits: [
          {
            customerId: 'cust-kunal',
            customerName: 'Kunal',
            amountPaise: 32_533,
            recoveredFromDepositPaise: 32_533,
            collectedDuringCheckoutPaise: 0,
          },
        ],
        manualCreditPaise: 0,
        totalDeductedPaise: 32_533,
      },
      previousContributions: [],
      remainingBillPaise: 121_067,
      useProRata: true,
      timeline: [
        timelineEntry({
          customerId: 'cust-kunal',
          customerName: 'Kunal',
          bookingId: 'booking-kunal',
          role: 'departed',
          activeDays: 21,
          calculatedSharePaise: 32_533,
          recoveredFromDepositPaise: 32_533,
          monthlyInvoiceAmountPaise: 0,
          settlementStatus: 'recovered_from_deposit',
          settlementStatusLabel: '✓ Recovered from deposit',
        }),
        timelineEntry({
          customerId: 'cust-krishna',
          customerName: 'Krishna',
          bookingId: 'booking-krishna',
          activeDays: 25,
          calculatedSharePaise: 54_051,
          monthlyInvoiceAmountPaise: 54_051,
        }),
        timelineEntry(),
      ],
      generatedAt: '2026-07-31T00:00:00.000Z',
    };

    const explanation = buildResidentElectricityBillExplanation({
      breakdown,
      settlementRows: [
        settlementRow({
          customerId: 'cust-kunal',
          customerName: 'Kunal',
          amountOwedPaise: 32_533,
          amountPaidPaise: 32_533,
          amountDeductedFromDepositPaise: 32_533,
          outstandingPaise: 0,
          status: 'settled',
        }),
        settlementRow({
          customerId: 'cust-krishna',
          customerName: 'Krishna',
          bookingId: 'booking-krishna',
          amountOwedPaise: 54_051,
          outstandingPaise: 54_051,
        }),
        settlementRow(),
      ],
      bedCodeByCustomerId: new Map([
        ['cust-kunal', 'B2'],
        ['cust-krishna', 'B3'],
        ['cust-dhruv', 'B1'],
      ]),
      viewerCustomerId: 'cust-dhruv',
      yourSharePaise: 67_016,
      lateFeeWaived: true,
      lateFeePaise: 0,
      roomTotalPaise: 153_600,
      recoveredFromDepositPaise: 32_533,
      collectedPaise: 0,
      outstandingPaise: 121_067,
    });

    assert.equal(explanation.participants.length, 3);
    assert.equal(explanation.participants[0]?.status, 'Recovered from Deposit');
    assert.equal(explanation.participants[1]?.status, 'Pending');
    assert.equal(explanation.summary.roomTotalPaise, 153_600);
    assert.equal(explanation.summary.recoveredFromDepositPaise, 32_533);
    assert.equal(explanation.summary.outstandingPaise, 121_067);
    assert.equal(explanation.summary.yourSharePaise, 67_016);
    assert.equal(explanation.summary.lateFeeLabel, 'Waived');
    assert.equal(explanation.participants[2]?.bedCode, 'B1');
    assert.equal(explanation.participants[2]?.stayDurationLabel, 'Stayed 31 days');
  });
});

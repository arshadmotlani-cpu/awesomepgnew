import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCheckoutElectricityOperatorAudit,
  resolveCheckoutElectricityDepositDeductionForSave,
} from '@/src/lib/checkout/checkoutElectricityOperatorAudit';
import type { RoomOccupantSlice } from '@/src/lib/checkout/roomElectricityAllocation';

const occupants: RoomOccupantSlice[] = [
  {
    bookingId: 'b-d',
    customerId: 'dhruv',
    customerName: 'Dhruv',
    stayStart: '2026-07-01',
    stayEndExclusive: '2026-09-26',
  },
  {
    bookingId: 'b-a',
    customerId: 'ameen',
    customerName: 'Ameen',
    stayStart: '2026-08-01',
    stayEndExclusive: '2026-09-20',
  },
];

test('meter-period ledger: finalized 337→424 plus tail 424→479', () => {
  const audit = buildCheckoutElectricityOperatorAudit({
    billingMonth: '2026-09-01',
    vacatingDate: '2026-09-25',
    ratePerUnitPaise: 1600,
    chainOpeningUnits: 337,
    checkoutClosingUnits: 479,
    finalizedBill: {
      billingMonth: '2026-09-01',
      openingUnits: 337,
      closingUnits: 424,
      grossPaise: 139_200,
      ratePerUnitPaise: 1600,
      periodStartDate: '2026-09-01',
      periodEndDate: '2026-09-03',
      finalizedOnDate: '2026-09-04',
    },
    invoiceCredits: [
      { customerId: 'dhruv', customerName: 'Dhruv', amountPaise: 62_600, paidPaise: 62_600, status: 'paid' },
      { customerId: 'ameen', customerName: 'Ameen', amountPaise: 62_600, paidPaise: 62_600, status: 'paid' },
      { customerId: 'saswat', customerName: 'Saswat', amountPaise: 13_900, paidPaise: 13_900, status: 'paid' },
    ],
    occupants,
    currentCustomerId: 'dhruv',
    electricityCalculationMethod: 'meter_reading',
    electricitySharePaise: 0,
    electricityDeductFromDeposit: true,
  });

  const { meterPeriodLedger } = audit;
  assert.equal(meterPeriodLedger.periods.length, 2);
  assert.equal(meterPeriodLedger.periods.find((p) => p.id === 'unbilled_tail')!.grossPaise, 88_000);
});

test('save path uses ledger suggested deduction not raw meter share', () => {
  const audit = buildCheckoutElectricityOperatorAudit({
    billingMonth: '2026-09-01',
    vacatingDate: '2026-09-25',
    ratePerUnitPaise: 1600,
    chainOpeningUnits: 337,
    checkoutClosingUnits: 479,
    finalizedBill: {
      billingMonth: '2026-09-01',
      openingUnits: 337,
      closingUnits: 424,
      grossPaise: 139_200,
      ratePerUnitPaise: 1600,
      periodStartDate: '2026-09-01',
      periodEndDate: '2026-09-03',
      finalizedOnDate: '2026-09-04',
    },
    invoiceCredits: [
      { customerId: 'dhruv', customerName: 'Dhruv', amountPaise: 62_600, paidPaise: 62_600, status: 'paid' },
    ],
    occupants,
    currentCustomerId: 'dhruv',
    electricityCalculationMethod: 'meter_reading',
    electricitySharePaise: 0,
    electricityDeductFromDeposit: true,
  });

  const deduct = resolveCheckoutElectricityDepositDeductionForSave({
    meterPeriodLedger: audit.meterPeriodLedger,
    timelineSharePaise: 999_999,
    meterSharePaise: 2_272_000,
    electricityDeductFromDeposit: true,
    electricityCalculationMethod: 'meter_reading',
  });
  assert.equal(deduct, audit.meterPeriodLedger.suggestedDepositDeductionPaise);
  assert.notEqual(deduct, 2_272_000);
});

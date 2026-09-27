import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRoomElectricityMeterPeriodLedger,
  type ResidentInvoiceCredit,
} from '@/src/lib/billing/roomElectricityMeterPeriodLedger';
import type { RoomOccupantSlice } from '@/src/lib/checkout/roomElectricityAllocation';

const RATE = 1600;

function sep337To424Finalized(periodEndDate = '2026-09-03') {
  return {
    billingMonth: '2026-09-01',
    openingUnits: 337,
    closingUnits: 424,
    grossPaise: 139_200,
    ratePerUnitPaise: RATE,
    periodStartDate: '2026-09-01',
    periodEndDate,
    finalizedOnDate: '2026-09-04',
  };
}

function room102SepInvoices(): ResidentInvoiceCredit[] {
  return [
    { customerId: 'dhruv', customerName: 'Dhruv', amountPaise: 62_600, paidPaise: 62_600, status: 'paid' },
    { customerId: 'ameen', customerName: 'Ameen', amountPaise: 62_600, paidPaise: 62_600, status: 'paid' },
    { customerId: 'saswat', customerName: 'Saswat', amountPaise: 13_900, paidPaise: 13_900, status: 'paid' },
  ];
}

function room102Occupants(): RoomOccupantSlice[] {
  return [
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
    {
      bookingId: 'b-s',
      customerId: 'saswat',
      customerName: 'Saswat',
      stayStart: '2026-08-08',
      stayEndExclusive: '2026-09-26',
    },
    {
      bookingId: 'b-g',
      customerId: 'sagar',
      customerName: 'Sagar',
      stayStart: '2026-09-20',
      stayEndExclusive: null,
    },
  ];
}

test('337→424 finalized at ₹1,392 remains locked historical period', () => {
  const ledger = buildRoomElectricityMeterPeriodLedger({
    billingMonth: '2026-09-01',
    vacatingDate: '2026-09-25',
    ratePerUnitPaise: RATE,
    chainOpeningUnits: 337,
    checkoutClosingUnits: 424,
    finalizedBill: sep337To424Finalized(),
    invoiceCredits: room102SepInvoices(),
    occupants: room102Occupants(),
    currentCustomerId: 'dhruv',
    electricityDeductFromDeposit: true,
  });
  const finalized = ledger.periods.find((p) => p.id === 'finalized');
  assert.ok(finalized);
  assert.equal(finalized!.grossPaise, 139_200);
  assert.equal(finalized!.locked, true);
  assert.equal(finalized!.openingUnits, 337);
  assert.equal(finalized!.closingUnits, 424);
});

test('reading 479 does not rebill 337→424 — incremental tail 424→479 = ₹880', () => {
  const ledger = buildRoomElectricityMeterPeriodLedger({
    billingMonth: '2026-09-01',
    vacatingDate: '2026-09-25',
    ratePerUnitPaise: RATE,
    chainOpeningUnits: 337,
    checkoutClosingUnits: 479,
    finalizedBill: sep337To424Finalized(),
    invoiceCredits: room102SepInvoices(),
    occupants: room102Occupants(),
    currentCustomerId: 'dhruv',
    electricityDeductFromDeposit: true,
  });
  assert.equal(ledger.periods.length, 2);
  const tail = ledger.periods.find((p) => p.id === 'unbilled_tail');
  assert.ok(tail);
  assert.equal(tail!.openingUnits, 424);
  assert.equal(tail!.closingUnits, 479);
  assert.equal(tail!.unitsConsumed, 55);
  assert.equal(tail!.grossPaise, 88_000);
  assert.notEqual(tail!.grossPaise, 142 * RATE);
});

test('previous resident collections credited on finalized period only once', () => {
  const ledger = buildRoomElectricityMeterPeriodLedger({
    billingMonth: '2026-09-01',
    vacatingDate: '2026-09-25',
    ratePerUnitPaise: RATE,
    chainOpeningUnits: 337,
    checkoutClosingUnits: 479,
    finalizedBill: sep337To424Finalized(),
    invoiceCredits: room102SepInvoices(),
    occupants: room102Occupants(),
    currentCustomerId: 'dhruv',
    electricityDeductFromDeposit: true,
  });
  const finalized = ledger.periods.find((p) => p.id === 'finalized')!;
  assert.equal(finalized.collectedPaise, 139_100);
  assert.equal(finalized.remainingPaise, 100);
});

test('paid resident with no outstanding finalized invoice gets ₹0 from finalized slice', () => {
  const ledger = buildRoomElectricityMeterPeriodLedger({
    billingMonth: '2026-09-01',
    vacatingDate: '2026-09-25',
    ratePerUnitPaise: RATE,
    chainOpeningUnits: 337,
    checkoutClosingUnits: 479,
    finalizedBill: sep337To424Finalized(),
    invoiceCredits: room102SepInvoices(),
    occupants: room102Occupants(),
    currentCustomerId: 'dhruv',
    electricityDeductFromDeposit: true,
  });
  assert.equal(ledger.currentResident.remainingPaise, ledger.currentResident.depositDeductionPaise);
  assert.ok(ledger.currentResident.depositDeductionPaise >= 0);
});

test('checkout deduction equals resident remaining liability (tail allocation)', () => {
  const ledger = buildRoomElectricityMeterPeriodLedger({
    billingMonth: '2026-09-01',
    vacatingDate: '2026-09-25',
    ratePerUnitPaise: RATE,
    chainOpeningUnits: 337,
    checkoutClosingUnits: 479,
    finalizedBill: sep337To424Finalized(),
    invoiceCredits: room102SepInvoices(),
    occupants: room102Occupants(),
    currentCustomerId: 'dhruv',
    electricityDeductFromDeposit: true,
  });
  assert.equal(
    ledger.suggestedDepositDeductionPaise,
    ledger.currentResident.remainingPaise,
  );
});

test('outstanding invoice balance adds to deposit deduction', () => {
  const invoices = room102SepInvoices();
  invoices[0] = { ...invoices[0]!, paidPaise: 50_000 };
  const ledger = buildRoomElectricityMeterPeriodLedger({
    billingMonth: '2026-09-01',
    vacatingDate: '2026-09-25',
    ratePerUnitPaise: RATE,
    chainOpeningUnits: 337,
    checkoutClosingUnits: 424,
    finalizedBill: sep337To424Finalized(),
    invoiceCredits: invoices,
    occupants: room102Occupants(),
    currentCustomerId: 'dhruv',
    electricityDeductFromDeposit: true,
  });
  assert.ok(ledger.suggestedDepositDeductionPaise >= 12_600);
});

test('historical finalized gross unchanged when tail added', () => {
  const base = buildRoomElectricityMeterPeriodLedger({
    billingMonth: '2026-09-01',
    vacatingDate: '2026-09-25',
    ratePerUnitPaise: RATE,
    chainOpeningUnits: 337,
    checkoutClosingUnits: 424,
    finalizedBill: sep337To424Finalized(),
    invoiceCredits: room102SepInvoices(),
    occupants: room102Occupants(),
    currentCustomerId: 'dhruv',
    electricityDeductFromDeposit: true,
  });
  const withTail = buildRoomElectricityMeterPeriodLedger({
    billingMonth: '2026-09-01',
    vacatingDate: '2026-09-25',
    ratePerUnitPaise: RATE,
    chainOpeningUnits: 337,
    checkoutClosingUnits: 479,
    finalizedBill: sep337To424Finalized(),
    invoiceCredits: room102SepInvoices(),
    occupants: room102Occupants(),
    currentCustomerId: 'dhruv',
    electricityDeductFromDeposit: true,
  });
  assert.equal(
    base.periods.find((p) => p.id === 'finalized')!.grossPaise,
    withTail.periods.find((p) => p.id === 'finalized')!.grossPaise,
  );
});

test('vacating on finalized period end still allocates tail by occupancy (not zero days)', () => {
  const ledger = buildRoomElectricityMeterPeriodLedger({
    billingMonth: '2026-09-01',
    vacatingDate: '2026-09-25',
    ratePerUnitPaise: RATE,
    chainOpeningUnits: 424,
    checkoutClosingUnits: 479,
    finalizedBill: sep337To424Finalized('2026-09-25'),
    invoiceCredits: [
      {
        customerId: 'dhruv',
        customerName: 'Dhruv',
        amountPaise: 62_600,
        paidPaise: 62_600,
        status: 'paid',
      },
    ],
    occupants: room102Occupants(),
    currentCustomerId: 'dhruv',
    electricityDeductFromDeposit: true,
  });
  const tail = ledger.periods.find((p) => p.id === 'unbilled_tail');
  assert.ok(tail);
  assert.equal(tail!.periodStart, '2026-09-25');
  assert.equal(tail!.periodEndExclusive, '2026-09-26');
  assert.ok(ledger.currentResident.tailCalculatedSharePaise > 0);
  assert.equal(ledger.currentResident.tailAlreadyCollectedPaise, 0);
  assert.equal(ledger.currentResident.finalizedInvoiceRemainingPaise, 0);
  assert.ok(ledger.suggestedDepositDeductionPaise > 0);
});

test('September invoice payment is not credited against unbilled tail', () => {
  const ledger = buildRoomElectricityMeterPeriodLedger({
    billingMonth: '2026-09-01',
    vacatingDate: '2026-09-25',
    ratePerUnitPaise: RATE,
    chainOpeningUnits: 424,
    checkoutClosingUnits: 479,
    finalizedBill: sep337To424Finalized('2026-09-25'),
    invoiceCredits: room102SepInvoices(),
    occupants: room102Occupants(),
    currentCustomerId: 'dhruv',
    electricityDeductFromDeposit: true,
  });
  assert.equal(ledger.currentResident.tailAlreadyCollectedPaise, 0);
  assert.equal(ledger.periods.find((p) => p.id === 'unbilled_tail')!.collectedPaise, 0);
});

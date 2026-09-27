import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCheckoutElectricityOperatorAudit,
  operatorDisplayRoomBillPaise,
  resolveCheckoutElectricityDepositDeductionForSave,
  resolveResidentElectricityRemainingPaise,
} from '@/src/lib/checkout/checkoutElectricityOperatorAudit';
import { computeCheckoutSettlementV2 } from '@/src/lib/checkout/checkoutSettlementEngineV2';

test('finalized bill is authoritative — stale meter cannot override display bill', () => {
  const audit = buildCheckoutElectricityOperatorAudit({
    billingMonth: '2026-09-01',
    authoritativeBillPaise: 139_200,
    billSource: 'electricity_bill',
    staleMeterDerivedBillPaise: 227_200,
    residentInvoice: {
      billingMonth: '2026-09-01',
      amountPaise: 62_600,
      paidPaise: 62_600,
      status: 'paid',
    },
    electricityCalculationMethod: 'meter_reading',
    electricitySharePaise: 0,
    electricityDeductFromDeposit: true,
  });

  assert.equal(audit.hasFinalizedHistoricalBill, true);
  assert.equal(operatorDisplayRoomBillPaise(audit), 139_200);
  assert.equal(audit.staleMeterDerivedBillPaise, 227_200);
  assert.notEqual(audit.historicalBillPaise, audit.staleMeterDerivedBillPaise);
});

test('persisted invoice — already paid produces zero remaining and zero deposit deduction on save', () => {
  const invoice = {
    billingMonth: '2026-09-01',
    amountPaise: 62_600,
    paidPaise: 62_600,
    status: 'paid',
  };
  const remaining = resolveResidentElectricityRemainingPaise({
    residentInvoice: invoice,
    fallbackCollectedPaise: 0,
  });
  assert.equal(remaining.remainingPaise, 0);
  assert.equal(remaining.usesPersistedInvoice, true);

  const deduct = resolveCheckoutElectricityDepositDeductionForSave({
    residentInvoice: invoice,
    timelineSharePaise: 46_400,
    meterSharePaise: 1_136_000,
    electricityDeductFromDeposit: true,
  });
  assert.equal(deduct, 0);
});

test('outstanding invoice balance becomes deposit deduction — not timeline fair share', () => {
  const invoice = {
    billingMonth: '2026-09-01',
    amountPaise: 62_600,
    paidPaise: 50_000,
    status: 'pending',
  };
  const deduct = resolveCheckoutElectricityDepositDeductionForSave({
    residentInvoice: invoice,
    timelineSharePaise: 10_000,
    meterSharePaise: 62_600,
    electricityDeductFromDeposit: true,
  });
  assert.equal(deduct, 12_600);
});

test('Dhruv-shaped refund: deposit minus elec plus unused rent', () => {
  const wf = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-07-01',
    stayCheckoutDate: '2026-09-25',
    rentPaidPaise: 1_236_240,
    monthlyRentPaise: 412_080,
    depositCollectedPaise: 412_080,
    missingNoticeDays: 0,
    electricityPaise: 0,
    electricityDeductFromDeposit: true,
    prepaidAfterVacatingPaise: 68_680,
  });

  assert.equal(wf.depositBucket.collectedPaise, 412_080);
  assert.equal(wf.depositBucket.electricityPaise, 0);
  assert.equal(wf.depositBucket.refundablePaise, 412_080);
  assert.equal(wf.refund.unusedRentPortionPaise, 68_680);
  assert.equal(wf.refund.totalPaise, 480_760);
});

test('operator audit uses invoice face amounts for display — not fair share', () => {
  const audit = buildCheckoutElectricityOperatorAudit({
    billingMonth: '2026-09-01',
    authoritativeBillPaise: 139_200,
    billSource: 'electricity_bill',
    residentInvoice: {
      billingMonth: '2026-09-01',
      amountPaise: 62_600,
      paidPaise: 62_600,
      status: 'paid',
    },
    fallbackCollectedPaise: 62_600,
    electricityCalculationMethod: 'meter_reading',
    electricitySharePaise: 0,
    electricityDeductFromDeposit: true,
  });

  assert.equal(audit.residentBilledPaise, 62_600);
  assert.equal(audit.alreadyCollectedPaise, 62_600);
  assert.equal(audit.electricityRemainingPaise, 0);
  assert.equal(audit.depositDeductionPaise, 0);
  assert.equal(audit.usesPersistedInvoiceForDisplay, true);
});

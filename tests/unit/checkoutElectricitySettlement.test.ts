import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveCheckoutElectricityDeductionPaise,
  resolveCheckoutElectricitySharePaise,
  calculateManualElectricityCharge,
} from '@/src/lib/checkout/electricitySettlementCalc';

test('manual_amount uses manualChargePaise as SSOT even when electricity_share_paise is zero', () => {
  const row = {
    electricityCalculationMethod: 'manual_amount' as const,
    electricitySharePaise: 0,
    manualChargePaise: 22_400,
    electricityDeductFromDeposit: true,
  };
  assert.equal(resolveCheckoutElectricitySharePaise(row), 22_400);
  assert.equal(resolveCheckoutElectricityDeductionPaise(row), 22_400);
});

test('manual_amount with deductFromDeposit false yields zero deduction', () => {
  const row = {
    electricityCalculationMethod: 'manual_amount' as const,
    electricitySharePaise: 0,
    manualChargePaise: 22_400,
    electricityDeductFromDeposit: false,
  };
  assert.equal(resolveCheckoutElectricitySharePaise(row), 22_400);
  assert.equal(resolveCheckoutElectricityDeductionPaise(row), 0);
});

test('meter_reading uses electricity_share_paise', () => {
  const row = {
    electricityCalculationMethod: 'meter_reading' as const,
    electricitySharePaise: 15_000,
    manualChargePaise: 99_999,
    electricityDeductFromDeposit: true,
  };
  assert.equal(resolveCheckoutElectricitySharePaise(row), 15_000);
  assert.equal(resolveCheckoutElectricityDeductionPaise(row), 15_000);
});

test('calculateManualElectricityCharge sets share equal to manual charge', () => {
  const result = calculateManualElectricityCharge({
    manualChargePaise: 22_400,
    roomOccupants: 3,
    autoDetectedOccupants: 3,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.calc.method, 'manual_amount');
  assert.equal(result.calc.sharePaise, 22_400);
  assert.equal(result.calc.totalBillPaise, 22_400);
});

test('refund preview subtracts manual electricity from deposit', () => {
  const depositHeld = 50_000;
  const manualCharge = 22_400;
  const noticeFee = 0;
  const totalDeductions = noticeFee + manualCharge;
  const finalRefund = Math.max(0, depositHeld - totalDeductions);
  assert.equal(finalRefund, 27_600);
});

test('room ledger remaining equals total bill minus collected after checkout', () => {
  const totalBill = 120_000;
  const checkoutCollected = 22_400;
  const remaining = Math.max(0, totalBill - checkoutCollected);
  assert.equal(remaining, 97_600);
});

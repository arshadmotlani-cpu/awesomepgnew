import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveResidentElectricitySettlementLine } from '@/src/lib/billing/electricityMeterPeriodResidentSettlement';
import type { RoomElectricityOccupantRow } from '@/src/lib/billing/roomElectricityOccupants';

const occupant = (customerId: string, bookingId: string): RoomElectricityOccupantRow => ({
  bookingId,
  bookingIds: [bookingId],
  customerId,
  customerName: customerId,
  bedCount: 1,
  weight: 10,
  bedIds: ['b1'],
  intervals: [{ startDate: '2026-09-05', endDateExclusive: '2026-09-20' }],
  occupiedDates: ['2026-09-05'],
});

test('active resident — allocation becomes dues', () => {
  const line = resolveResidentElectricitySettlementLine({
    occupant: occupant('saswat', 'bk-s'),
    bounds: { start: '2026-09-05', end: '2026-10-04', days: 30 },
    grossAllocationPaise: 44100,
    previouslyCollectedPaise: 0,
    checkoutElectricitySettledPaise: 0,
    completedCheckoutInPeriod: false,
    refundableBalancePaise: 412080,
    isActiveResident: true,
    hasCheckoutSettlement: false,
    meterPeriodElectricityEstablished: true,
  });
  assert.equal(line.newDuesPaise, 44100);
  assert.equal(line.depositElectricityDeductionPaise, 0);
  assert.equal(line.category, 'outstanding_dues');
});

test('vacated with sufficient deposit — deduct, no dues', () => {
  const line = resolveResidentElectricitySettlementLine({
    occupant: occupant('mukundar', 'bk-m'),
    bounds: { start: '2026-09-26', end: '2026-10-01', days: 6 },
    grossAllocationPaise: 7600,
    previouslyCollectedPaise: 0,
    checkoutElectricitySettledPaise: 0,
    completedCheckoutInPeriod: false,
    refundableBalancePaise: 95000,
    isActiveResident: false,
    hasCheckoutSettlement: true,
    meterPeriodElectricityEstablished: true,
  });
  assert.equal(line.depositElectricityDeductionPaise, 7600);
  assert.equal(line.newDuesPaise, 0);
  assert.equal(line.remainingRefundableBalancePaise, 87400);
  assert.equal(line.requiresMeterPhotoForDepositSettlement, false);
});

test('vacated insufficient deposit — partial deposit + dues', () => {
  const line = resolveResidentElectricitySettlementLine({
    occupant: occupant('x', 'bk-x'),
    bounds: { start: '2026-09-05', end: '2026-09-10', days: 5 },
    grossAllocationPaise: 10000,
    previouslyCollectedPaise: 0,
    checkoutElectricitySettledPaise: 0,
    completedCheckoutInPeriod: false,
    refundableBalancePaise: 3000,
    isActiveResident: false,
    hasCheckoutSettlement: true,
    meterPeriodElectricityEstablished: true,
  });
  assert.equal(line.depositElectricityDeductionPaise, 3000);
  assert.equal(line.newDuesPaise, 7000);
});

test('prior collection — no duplicate dues', () => {
  const line = resolveResidentElectricitySettlementLine({
    occupant: occupant('a', 'bk-a'),
    bounds: { start: '2026-09-05', end: '2026-09-19', days: 15 },
    grossAllocationPaise: 19200,
    previouslyCollectedPaise: 19200,
    checkoutElectricitySettledPaise: 0,
    completedCheckoutInPeriod: true,
    refundableBalancePaise: 0,
    isActiveResident: false,
    hasCheckoutSettlement: true,
    meterPeriodElectricityEstablished: true,
  });
  assert.equal(line.remainingElectricityPaise, 0);
  assert.equal(line.category, 'already_settled');
});

test('completed checkout in period without electricity line — not re-invoiced', () => {
  const line = resolveResidentElectricitySettlementLine({
    occupant: occupant('dhruv', 'bk-d'),
    bounds: { start: '2026-09-05', end: '2026-09-25', days: 21 },
    grossAllocationPaise: 26800,
    previouslyCollectedPaise: 0,
    checkoutElectricitySettledPaise: 0,
    completedCheckoutInPeriod: true,
    refundableBalancePaise: 0,
    isActiveResident: false,
    hasCheckoutSettlement: true,
    meterPeriodElectricityEstablished: true,
  });
  assert.equal(line.newDuesPaise, 0);
});

test('vacated zero deposit — electricity becomes dues', () => {
  const line = resolveResidentElectricitySettlementLine({
    occupant: occupant('x', 'bk-x'),
    bounds: { start: '2026-09-05', end: '2026-09-10', days: 5 },
    grossAllocationPaise: 5000,
    previouslyCollectedPaise: 0,
    checkoutElectricitySettledPaise: 0,
    completedCheckoutInPeriod: false,
    refundableBalancePaise: 0,
    isActiveResident: false,
    hasCheckoutSettlement: true,
    meterPeriodElectricityEstablished: true,
  });
  assert.equal(line.newDuesPaise, 5000);
  assert.equal(line.depositElectricityDeductionPaise, 0);
});

test('vacated without checkout settlement — dues not deposit', () => {
  const line = resolveResidentElectricitySettlementLine({
    occupant: occupant('sagar', 'bk-s'),
    bounds: { start: '2026-09-20', end: '2026-10-02', days: 13 },
    grossAllocationPaise: 17200,
    previouslyCollectedPaise: 0,
    checkoutElectricitySettledPaise: 0,
    completedCheckoutInPeriod: false,
    refundableBalancePaise: 412080,
    isActiveResident: false,
    hasCheckoutSettlement: false,
    meterPeriodElectricityEstablished: true,
  });
  assert.equal(line.newDuesPaise, 17200);
  assert.equal(line.depositElectricityDeductionPaise, 0);
});

test('refundable balance cannot go negative', () => {
  const line = resolveResidentElectricitySettlementLine({
    occupant: occupant('m', 'bk-m'),
    bounds: { start: '2026-09-26', end: '2026-10-01', days: 6 },
    grossAllocationPaise: 7600,
    previouslyCollectedPaise: 0,
    checkoutElectricitySettledPaise: 0,
    completedCheckoutInPeriod: false,
    refundableBalancePaise: 95000,
    isActiveResident: false,
    hasCheckoutSettlement: true,
    meterPeriodElectricityEstablished: true,
  });
  assert.ok(line.remainingRefundableBalancePaise >= 0);
});

test('meter photo not required when meter period established', () => {
  const line = resolveResidentElectricitySettlementLine({
    occupant: occupant('m', 'bk-m'),
    bounds: { start: '2026-09-26', end: '2026-10-01', days: 6 },
    grossAllocationPaise: 7600,
    previouslyCollectedPaise: 0,
    checkoutElectricitySettledPaise: 0,
    completedCheckoutInPeriod: false,
    refundableBalancePaise: 95000,
    isActiveResident: false,
    hasCheckoutSettlement: true,
    meterPeriodElectricityEstablished: true,
  });
  assert.equal(line.requiresMeterPhotoForDepositSettlement, false);
});

test('missing meter evidence — deposit settlement may require meter photo', () => {
  const line = resolveResidentElectricitySettlementLine({
    occupant: occupant('m', 'bk-m'),
    bounds: { start: '2026-09-26', end: '2026-10-01', days: 6 },
    grossAllocationPaise: 7600,
    previouslyCollectedPaise: 0,
    checkoutElectricitySettledPaise: 0,
    completedCheckoutInPeriod: false,
    refundableBalancePaise: 95000,
    isActiveResident: false,
    hasCheckoutSettlement: true,
    meterPeriodElectricityEstablished: false,
  });
  assert.equal(line.requiresMeterPhotoForDepositSettlement, true);
});

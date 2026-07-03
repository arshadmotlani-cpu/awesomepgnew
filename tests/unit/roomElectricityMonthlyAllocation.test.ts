import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateMonthlyElectricityInvoices } from '@/src/lib/billing/roomElectricityMonthlyAllocation';

test('checkout payer is excluded from monthly electricity invoices', () => {
  const checkout = new Map<string, number>([['resident-a', 22_400]]);
  const result = allocateMonthlyElectricityInvoices({
    grossTotalPaise: 120_000,
    prepaidCreditPaise: 0,
    occupants: [
      { bookingId: 'b1', customerId: 'resident-a', bedCount: 1, weight: 30 },
      { bookingId: 'b2', customerId: 'resident-b', bedCount: 1, weight: 30 },
    ],
    checkoutCollectedByCustomerId: checkout,
    useProRata: false,
  });

  assert.equal(result.checkoutCreditAppliedPaise, 22_400);
  assert.equal(result.netSplittablePaise, 97_600);
  const aInvoice = result.invoices.find((i) => i.customerId === 'resident-a');
  const bInvoice = result.invoices.find((i) => i.customerId === 'resident-b');
  assert.equal(aInvoice?.excludedBecauseCheckoutPaid, true);
  assert.equal(aInvoice?.amountPaise, 0);
  assert.equal(bInvoice?.amountPaise, 97_600);
});

test('room collection never exceeds gross bill', () => {
  const checkout = new Map<string, number>([['a', 50_000]]);
  const result = allocateMonthlyElectricityInvoices({
    grossTotalPaise: 120_000,
    prepaidCreditPaise: 10_000,
    occupants: [
      { bookingId: 'b1', customerId: 'a', bedCount: 1, weight: 15 },
      { bookingId: 'b2', customerId: 'b', bedCount: 1, weight: 15 },
    ],
    checkoutCollectedByCustomerId: checkout,
    useProRata: false,
  });

  const invoiceTotal = result.invoices
    .filter((i) => !i.excludedBecauseCheckoutPaid)
    .reduce((sum, i) => sum + i.amountPaise, 0);
  const collected = result.checkoutCreditAppliedPaise + result.prepaidCreditAppliedPaise + invoiceTotal;
  assert.ok(collected <= 120_000);
  assert.equal(result.netSplittablePaise, 60_000);
});

test('no checkout credit bills all occupants equally', () => {
  const result = allocateMonthlyElectricityInvoices({
    grossTotalPaise: 40_000,
    prepaidCreditPaise: 0,
    occupants: [
      { bookingId: 'b1', customerId: 'a', bedCount: 1, weight: 30 },
      { bookingId: 'b2', customerId: 'b', bedCount: 1, weight: 30 },
    ],
    checkoutCollectedByCustomerId: new Map(),
    useProRata: false,
  });

  assert.equal(result.netSplittablePaise, 40_000);
  assert.equal(result.invoices.filter((i) => i.amountPaise > 0).length, 2);
  assert.equal(result.invoices[0]?.amountPaise, 20_000);
  assert.equal(result.invoices[1]?.amountPaise, 20_000);
});

test('room 203 — deduct checkout collection then split among three active residents', () => {
  const grossTotalPaise = 287 * 1_600; // 459_200 — 287 units @ ₹16
  const checkoutCollected = new Map<string, number>([['departed', 99_000]]);
  const result = allocateMonthlyElectricityInvoices({
    grossTotalPaise,
    prepaidCreditPaise: 0,
    occupants: [
      { bookingId: 'krishna', customerId: 'krishna', bedCount: 1, weight: 30 },
      { bookingId: 'vijay', customerId: 'vijay', bedCount: 1, weight: 30 },
      { bookingId: 'waqar', customerId: 'waqar', bedCount: 1, weight: 30 },
      { bookingId: 'departed', customerId: 'departed', bedCount: 1, weight: 10 },
    ],
    checkoutCollectedByCustomerId: checkoutCollected,
    useProRata: false,
  });

  assert.equal(result.checkoutCreditAppliedPaise, 99_000);
  assert.equal(result.netSplittablePaise, 360_200);
  const billable = result.invoices.filter((i) => i.amountPaise > 0);
  assert.equal(billable.length, 3);
  for (const line of billable) {
    assert.ok(line.amountPaise >= 120_000 && line.amountPaise <= 120_100);
  }
  const departed = result.invoices.find((i) => i.customerId === 'departed');
  assert.equal(departed?.amountPaise, 0);
  assert.equal(departed?.excludedBecauseCheckoutPaid, true);
});

test('historical contributions reduce pool and assign remainder to remaining occupant', () => {
  const grossTotalPaise = 299_200; // ₹2,992
  const contributions = new Map<string, number>([
    ['resident-a', 122_000],
    ['resident-b', 50_000],
  ]);
  const result = allocateMonthlyElectricityInvoices({
    grossTotalPaise,
    prepaidCreditPaise: 0,
    contributionsByCustomerId: contributions,
    occupants: [
      { bookingId: 'b-a', customerId: 'resident-a', bedCount: 1, weight: 30 },
      { bookingId: 'b-b', customerId: 'resident-b', bedCount: 1, weight: 10 },
      { bookingId: 'b-c', customerId: 'resident-c', bedCount: 1, weight: 30 },
    ],
    checkoutCollectedByCustomerId: new Map(),
    useProRata: false,
  });

  assert.equal(result.roomContributionsAppliedPaise, 172_000);
  assert.equal(result.netSplittablePaise, 127_200);
  const remaining = result.invoices.find((i) => i.customerId === 'resident-c');
  assert.equal(remaining?.amountPaise, 127_200);
  assert.equal(result.invoices.find((i) => i.customerId === 'resident-a')?.amountPaise, 0);
  assert.equal(result.invoices.find((i) => i.customerId === 'resident-b')?.amountPaise, 0);
});

test('july bill ignores june contributions when contributions map is empty', () => {
  const result = allocateMonthlyElectricityInvoices({
    grossTotalPaise: 300_000,
    prepaidCreditPaise: 0,
    occupants: [
      { bookingId: 'b1', customerId: 'july-a', bedCount: 1, weight: 30 },
      { bookingId: 'b2', customerId: 'july-b', bedCount: 1, weight: 30 },
    ],
    checkoutCollectedByCustomerId: new Map(),
    useProRata: false,
  });

  assert.equal(result.netSplittablePaise, 300_000);
  assert.equal(result.invoices.filter((i) => i.amountPaise > 0).length, 2);
});

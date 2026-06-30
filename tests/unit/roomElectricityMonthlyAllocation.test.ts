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

import assert from 'node:assert/strict';
import test from 'node:test';
import { priceBasket } from '@/src/hair/domain/basket/engine';
import type { Basket, BasketLine, PaymentEntry } from '@/src/hair/domain/basket/types';
import { collectPaymentValidationErrors } from '@/src/hair/domain/basket/validateCheckout';
import {
  openReceivableBalanceFromLedger,
  planCheckoutLedger,
  planInvoiceSettlementLedger,
} from '@/src/hair/domain/ledger/plan';
import {
  computePaymentPanelSummary,
  flagsForMarkRemainingDue,
  syncDueFlagsAfterPaymentChange,
} from '@/src/hair/lib/quickSalePaymentPanelState';

const TEN_K = 1_000_000;
const TWO_K = 200_000;
const THREE_K = 300_000;
const FIVE_K = 500_000;
const EIGHT_K = 800_000;

const serviceLine: BasketLine = {
  lineId: 'l1',
  billableRef: { id: 's1', type: 'service' },
  snapshot: {
    name: 'Service',
    code: null,
    unitSellingPricePaise: TEN_K,
    gstBps: 1800,
    staffMode: 'SERVICE',
    category: null,
  },
  quantity: 1,
  overridePricePaise: null,
  staff: [{ staffId: 'st1', shareBps: 10_000 }],
};

function pay(method: PaymentEntry['method'], amountPaise: number): PaymentEntry {
  return { id: `${method}-${amountPaise}`, method, amountPaise };
}

function basket(overrides: Partial<Basket> = {}): Basket {
  return {
    customerId: 'c1',
    lines: [serviceLine],
    payments: [],
    flags: {},
    membershipDiscountPaise: 0,
    ...overrides,
  };
}

test('1 — ₹10k invoice + ₹2k cash + mark due → sale 10k, cash 2k, due 8k', () => {
  const payments = [pay('cash', TWO_K)];
  const flags = flagsForMarkRemainingDue({ paidPaise: TWO_K, remainingPaise: EIGHT_K });
  const ledger = planCheckoutLedger({
    customerId: 'c1',
    grandTotalPaise: TEN_K,
    payments,
    flags,
  });
  const sale = ledger.find((e) => e.kind === 'invoice_charge');
  assert.equal(sale?.amountPaise, TEN_K);
  const cash = ledger.filter((e) => e.account === 'cash' && e.direction === 'debit');
  assert.equal(cash.reduce((s, e) => s + e.amountPaise, 0), TWO_K);
  assert.equal(openReceivableBalanceFromLedger(ledger), EIGHT_K);
  const priced = priceBasket(basket({ payments, flags }));
  assert.equal(priced.totals.grandTotalPaise, TEN_K);
});

test('2 — ₹10k + ₹2k cash + ₹3k UPI + mark due → due 5k', () => {
  const payments = [pay('cash', TWO_K), pay('upi', THREE_K)];
  const flags = flagsForMarkRemainingDue({ paidPaise: TWO_K + THREE_K, remainingPaise: FIVE_K });
  const ledger = planCheckoutLedger({
    customerId: 'c1',
    grandTotalPaise: TEN_K,
    payments,
    flags,
  });
  assert.equal(openReceivableBalanceFromLedger(ledger), FIVE_K);
});

test('3 — full ₹10k payment → no receivable open; mark due disabled', () => {
  const payments = [pay('cash', TEN_K)];
  const summary = computePaymentPanelSummary({
    grandTotalPaise: TEN_K,
    payments,
    flags: {},
  });
  assert.equal(summary.remainingPaise, 0);
  assert.equal(summary.isComplete, true);
  const ledger = planCheckoutLedger({
    customerId: 'c1',
    grandTotalPaise: TEN_K,
    payments,
    flags: {},
  });
  assert.equal(openReceivableBalanceFromLedger(ledger), 0);
  assert.ok(!ledger.some((e) => e.kind === 'receivable_open'));
});

test('4 — multiple add-payment amounts accumulate in panel summary', () => {
  const payments = [pay('cash', TWO_K), pay('upi', THREE_K)];
  const summary = computePaymentPanelSummary({
    grandTotalPaise: TEN_K,
    payments,
    flags: {},
  });
  assert.equal(summary.paidPaise, TWO_K + THREE_K);
  assert.equal(summary.remainingPaise, FIVE_K);
});

test('5 — partial payment without mark due fails checkout validation', () => {
  const errors = collectPaymentValidationErrors(TEN_K, TWO_K, {});
  assert.ok(errors.some((e) => /mark as due/i.test(e)));
});

test('6 — later ₹8k due settlement records collection without second sale', () => {
  const settlement = planInvoiceSettlementLedger([{ method: 'cash', amountPaise: EIGHT_K }]);
  assert.equal(settlement.some((e) => e.kind === 'invoice_charge'), false);
  assert.ok(
    settlement.some(
      (e) => e.kind === 'payment_received' && e.account === 'cash' && e.amountPaise === EIGHT_K,
    ),
  );
  assert.ok(
    settlement.some(
      (e) => e.kind === 'receivable_settled' && e.account === 'accounts_receivable',
    ),
  );
});

test('7 — partial due checkout then settlement clears open receivable', () => {
  const checkout = planCheckoutLedger({
    customerId: 'c1',
    grandTotalPaise: TEN_K,
    payments: [pay('cash', TWO_K)],
    flags: { markDue: true },
  });
  assert.equal(openReceivableBalanceFromLedger(checkout), EIGHT_K);
  const settlement = planInvoiceSettlementLedger([{ method: 'upi', amountPaise: EIGHT_K }]);
  const combined = [...checkout, ...settlement];
  assert.equal(openReceivableBalanceFromLedger(combined), 0);
});

test('8 — adding partial payment clears stale markFullDue until remark', () => {
  const next = syncDueFlagsAfterPaymentChange(
    { markFullDue: true, markDue: false },
    TWO_K,
    TEN_K,
  );
  assert.equal(next.markFullDue, false);
  assert.equal(next.markDue, false);
});

test('9 — full-payment checkout ledger unchanged (AR credited at checkout)', () => {
  const ledger = planCheckoutLedger({
    customerId: 'c1',
    grandTotalPaise: TEN_K,
    payments: [pay('cash', TEN_K)],
    flags: {},
  });
  assert.ok(
    ledger.some(
      (e) =>
        e.account === 'accounts_receivable' &&
        e.kind === 'payment_received' &&
        e.direction === 'credit',
    ),
  );
});

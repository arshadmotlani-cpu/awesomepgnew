import assert from 'node:assert/strict';
import test from 'node:test';
import { planCheckoutLedger } from '@/src/hair/domain/ledger/plan';
import { walletBalanceFromLedger } from '@/src/hair/domain/ledger/plan';

test('checkout ledger debits customer wallet on wallet tender', () => {
  const entries = planCheckoutLedger({
    customerId: 'c1',
    grandTotalPaise: 10_000,
    payments: [{ id: 'p1', method: 'wallet', amountPaise: 4_000 }],
    flags: {},
  });
  assert.ok(
    entries.some(
      (e) =>
        e.kind === 'wallet_redemption' &&
        e.direction === 'debit' &&
        e.account === 'customer_wallet' &&
        e.amountPaise === 4_000,
    ),
  );
});

test('wallet balance reflects advance credit minus redemption', () => {
  const balance = walletBalanceFromLedger([
    { kind: 'advance_credit', direction: 'credit', amountPaise: 50_000 },
    { kind: 'wallet_redemption', direction: 'debit', amountPaise: 20_000 },
  ]);
  assert.equal(balance, 30_000);
});

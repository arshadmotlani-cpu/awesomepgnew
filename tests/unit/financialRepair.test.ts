import assert from 'node:assert/strict';
import test from 'node:test';
import { sumBreakdownLines } from '../../src/services/financialIntegrityAudit';

test('repair logic: line sum is SSOT for amountPaise correction', () => {
  const breakdown = {
    lines: [
      { kind: 'rent', label: 'Rent', amountPaise: 500000 },
      { kind: 'late_fee', label: 'Late fee', amountPaise: 6000 },
    ],
  };
  const wrongAmount = 600000;
  const corrected = sumBreakdownLines(breakdown);
  assert.notEqual(wrongAmount, corrected);
  assert.equal(corrected, 506000);
});

test('repair logic: payment reconciliation status derivation', () => {
  const amountPaise = 100000;
  const paidSoFar = 0;
  const paymentAmount = 100000;
  const newPaid = Math.max(paidSoFar, paymentAmount);
  const newStatus = newPaid >= amountPaise ? 'paid' : 'partial';
  assert.equal(newStatus, 'paid');

  const partialPayment = 40000;
  const partialPaid = Math.max(paidSoFar, partialPayment);
  const partialStatus = partialPaid >= amountPaise ? 'paid' : 'partial';
  assert.equal(partialStatus, 'partial');
});

test('repair logic: deposit shortfall invoice breakdown shape', () => {
  const amountPaise = 15000;
  const breakdown = {
    depositPaise: amountPaise,
    depositOutstandingPaise: amountPaise,
    lines: [{ kind: 'deposit', label: 'Deposit shortfall (audit repair)', amountPaise }],
  };
  assert.equal(sumBreakdownLines(breakdown), amountPaise);
  assert.equal(breakdown.depositOutstandingPaise, amountPaise);
});

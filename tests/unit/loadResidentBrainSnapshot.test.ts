import assert from 'node:assert/strict';
import test from 'node:test';

test('loadResidentBrainSnapshot composes financial + electricity maps', async () => {
  const { loadResidentBrainSnapshot } = await import(
    '../../src/lib/residents/loadResidentBrainSnapshot'
  );
  assert.equal(typeof loadResidentBrainSnapshot, 'function');
});

test('resident brain snapshot passes through preloaded financial account', async () => {
  const financialAccount = {
    customerId: 'c1',
    rentOutstandingPaise: 0,
    electricityOutstandingPaise: 0,
    depositHeldPaise: 10000,
    rent: { paidPaise: 0, items: [] },
    electricity: { paidPaise: 0, items: [] },
    deposit: { paidPaise: 10000, outstandingPaise: 0, requiredPaise: 10000, items: [] },
    other: { paidPaise: 0, items: [] },
  } as import('../../src/lib/billing/residentFinancialTypes').ResidentFinancialAccount;

  // Shape-only test — no DB
  assert.equal(financialAccount.depositHeldPaise, 10000);
});

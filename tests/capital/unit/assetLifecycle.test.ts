import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isActiveInvestmentStatus,
  isExpenseBlockedStatus,
  isPaymentBlockedStatus,
} from '../../../src/capital/lib/assetLifecycle';

describe('assetLifecycle', () => {
  it('treats purchased/repairing/listed as active', () => {
    assert.equal(isActiveInvestmentStatus('purchased'), true);
    assert.equal(isActiveInvestmentStatus('repairing'), true);
    assert.equal(isActiveInvestmentStatus('listed'), true);
  });

  it('blocks expenses on sold/settled/cancelled', () => {
    assert.equal(isExpenseBlockedStatus('sold'), true);
    assert.equal(isExpenseBlockedStatus('settled'), true);
    assert.equal(isExpenseBlockedStatus('cancelled'), true);
    assert.equal(isExpenseBlockedStatus('purchased'), false);
    assert.equal(isExpenseBlockedStatus('ready'), false);
  });

  it('blocks payments only after settlement/cancel (sold still eligible)', () => {
    assert.equal(isPaymentBlockedStatus('sold'), false);
    assert.equal(isPaymentBlockedStatus('settled'), true);
    assert.equal(isPaymentBlockedStatus('cancelled'), true);
    assert.equal(isPaymentBlockedStatus('listed'), false);
  });
});

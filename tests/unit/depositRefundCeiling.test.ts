import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertDepositRefundRequestAmountPaise,
  computeDepositRefundCeiling,
} from '../../src/lib/deposits/depositRefundCeiling';

describe('depositRefundCeiling', () => {
  it('Sagar: held 412080, required 360570 → refundable 51510', () => {
    const c = computeDepositRefundCeiling({
      heldPaise: 412_080,
      requiredPaise: 360_570,
    });
    assert.equal(c.refundableDepositPaise, 51_510);
    assert.equal(c.availableToRequestPaise, 51_510);
  });

  it('held equals required → refundable 0', () => {
    const c = computeDepositRefundCeiling({
      heldPaise: 360_570,
      requiredPaise: 360_570,
    });
    assert.equal(c.refundableDepositPaise, 0);
    assert.equal(c.availableToRequestPaise, 0);
  });

  it('held less than required → refundable 0', () => {
    const c = computeDepositRefundCeiling({
      heldPaise: 300_000,
      requiredPaise: 360_570,
    });
    assert.equal(c.refundableDepositPaise, 0);
  });

  it('pending refund reduces available to request', () => {
    const c = computeDepositRefundCeiling({
      heldPaise: 412_080,
      requiredPaise: 360_570,
      pendingRefundPaise: 20_000,
    });
    assert.equal(c.refundableDepositPaise, 51_510);
    assert.equal(c.availableToRequestPaise, 31_510);
  });

  it('reserved deposit reduces refundable', () => {
    const c = computeDepositRefundCeiling({
      heldPaise: 412_080,
      requiredPaise: 360_570,
      reservedPaise: 51_510,
    });
    assert.equal(c.refundableDepositPaise, 0);
  });

  it('server rejects amounts above available', () => {
    const ceiling = computeDepositRefundCeiling({
      heldPaise: 412_080,
      requiredPaise: 360_570,
    });
    assert.equal(assertDepositRefundRequestAmountPaise(51_510, ceiling).ok, true);
    assert.equal(assertDepositRefundRequestAmountPaise(60_000, ceiling).ok, false);
    assert.equal(assertDepositRefundRequestAmountPaise(360_570, ceiling).ok, false);
    assert.equal(assertDepositRefundRequestAmountPaise(412_080, ceiling).ok, false);
  });

  it('available to request never negative', () => {
    const c = computeDepositRefundCeiling({
      heldPaise: 412_080,
      requiredPaise: 360_570,
      pendingRefundPaise: 999_999,
    });
    assert.equal(c.availableToRequestPaise, 0);
  });
});

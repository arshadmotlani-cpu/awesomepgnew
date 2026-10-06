import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPrepaidRentRefundRequestAmountPaise,
  computePrepaidRentRefundCeiling,
} from '../../src/lib/billing/prepaidRentRefundCeiling';
import {
  allocateCombinedRefundRequestPaise,
  assertCombinedRefundRequestAmountPaise,
} from '../../src/lib/billing/residentRefundableNow';
import { computeDepositRefundCeiling } from '../../src/lib/deposits/depositRefundCeiling';

describe('prepaidRentRefundCeiling', () => {
  it('pending prepaid refund reduces available', () => {
    const c = computePrepaidRentRefundCeiling({
      netUnusedPrepaidRentPaise: 177_181,
      pendingRefundPaise: 177_181,
    });
    assert.equal(c.availableToRequestPaise, 0);
  });

  it('rejects amount above available', () => {
    const ceiling = computePrepaidRentRefundCeiling({ netUnusedPrepaidRentPaise: 177_181 });
    assert.equal(assertPrepaidRentRefundRequestAmountPaise(177_181, ceiling).ok, true);
    assert.equal(assertPrepaidRentRefundRequestAmountPaise(177_182, ceiling).ok, false);
  });
});

describe('residentRefundableNow allocation', () => {
  const sagarDeposit = computeDepositRefundCeiling({
    heldPaise: 412_080,
    requiredPaise: 360_570,
  });
  const sagarPrepaid = computePrepaidRentRefundCeiling({ netUnusedPrepaidRentPaise: 177_181 });

  it('Sagar: 177181 + 51510 = 228691 total', () => {
    const refundable = {
      prepaidRent: sagarPrepaid,
      deposit: sagarDeposit,
      prepaidRentRefundableNowPaise: sagarPrepaid.availableToRequestPaise,
      depositRefundableNowPaise: sagarDeposit.availableToRequestPaise,
      totalRefundableNowPaise:
        sagarPrepaid.availableToRequestPaise + sagarDeposit.availableToRequestPaise,
      requiredDepositLockedPaise: sagarDeposit.requiredPaise,
    };
    assert.equal(refundable.totalRefundableNowPaise, 228_691);
    const combined = assertCombinedRefundRequestAmountPaise(228_691, refundable);
    assert.equal(combined.ok, true);
    if (combined.ok) {
      assert.equal(combined.allocation.prepaidRentPaise, 177_181);
      assert.equal(combined.allocation.depositPaise, 51_510);
    }
  });

  it('waterfall: prepaid first then deposit', () => {
    const alloc = allocateCombinedRefundRequestPaise(200_000, {
      prepaidAvailablePaise: 177_181,
      depositAvailablePaise: 51_510,
    });
    assert.equal(alloc.prepaidRentPaise, 177_181);
    assert.equal(alloc.depositPaise, 22_819);
  });

  it('rejects above combined ceiling', () => {
    const refundable = {
      prepaidRent: sagarPrepaid,
      deposit: sagarDeposit,
      prepaidRentRefundableNowPaise: 177_181,
      depositRefundableNowPaise: 51_510,
      totalRefundableNowPaise: 228_691,
      requiredDepositLockedPaise: 360_570,
    };
    assert.equal(assertCombinedRefundRequestAmountPaise(228_692, refundable).ok, false);
    assert.equal(assertCombinedRefundRequestAmountPaise(360_570, refundable).ok, false);
    assert.equal(assertCombinedRefundRequestAmountPaise(412_080, refundable).ok, false);
  });

  it('partial prepaid only when unpaid month scenario', () => {
    const prepaid = computePrepaidRentRefundCeiling({ netUnusedPrepaidRentPaise: 0 });
    assert.equal(prepaid.availableToRequestPaise, 0);
  });
});

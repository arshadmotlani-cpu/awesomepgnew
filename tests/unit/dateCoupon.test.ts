import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyDateCouponToRentSubtotal,
  generateDateCouponCode,
  validateDateCoupon,
} from '../../src/lib/dateCoupon';

describe('dateCoupon', () => {
  const june13_2026_ist = new Date('2026-06-13T06:30:00.000Z');

  it('generates DDMMYY for IST calendar day', () => {
    assert.equal(generateDateCouponCode(june13_2026_ist), '130626');
  });

  it('accepts only today code', () => {
    assert.equal(validateDateCoupon('130626', june13_2026_ist).status, 'active');
    assert.equal(validateDateCoupon('120626', june13_2026_ist).status, 'expired');
    assert.equal(validateDateCoupon('140626', june13_2026_ist).status, 'not_yet_active');
    assert.equal(validateDateCoupon('bad', june13_2026_ist).status, 'invalid');
  });

  it('applies 10% to rent only', () => {
    const result = applyDateCouponToRentSubtotal(10_000_00, '130626', june13_2026_ist);
    assert.equal(result.ok, true);
    if (result.ok && result.coupon) {
      assert.equal(result.discountPaise, 1_000_00);
      assert.equal(result.netRentPaise, 9_000_00);
      assert.equal(result.coupon.discountPct, 10);
    }
  });

  it('returns invalid_coupon for wrong date', () => {
    const result = applyDateCouponToRentSubtotal(10_000_00, '120626', june13_2026_ist);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, 'invalid_coupon');
  });

  it('skips discount when code empty', () => {
    const result = applyDateCouponToRentSubtotal(10_000_00, '', june13_2026_ist);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.discountPaise, 0);
      assert.equal(result.coupon, null);
    }
  });
});

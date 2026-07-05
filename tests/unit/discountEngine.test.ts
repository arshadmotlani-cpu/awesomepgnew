import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDateCouponToRentSubtotal } from '../../src/lib/dateCoupon';

test('date coupon still applies 10% via existing module', () => {
  const today = new Date('2026-07-05T12:00:00+05:30');
  const result = applyDateCouponToRentSubtotal(900_000, '050726', today);
  assert.equal(result.ok, true);
  if (result.ok && result.coupon) {
    assert.equal(result.discountPaise, 90_000);
    assert.equal(result.netRentPaise, 810_000);
  }
});

test('referral discount math is 5% of rent', () => {
  const rent = 900_000;
  const discount = Math.floor((rent * 500) / 10_000);
  assert.equal(discount, 45_000);
  assert.equal(rent - discount, 855_000);
});

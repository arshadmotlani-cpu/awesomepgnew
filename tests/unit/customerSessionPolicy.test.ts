import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  customerRememberSessionMs,
  customerSessionExpiry,
  customerSessionMs,
  customerStandardSessionMs,
  shouldRefreshCustomerSession,
} from '../../src/lib/auth/customerSessionPolicy';

describe('customerSessionPolicy', () => {
  it('uses 30-day standard and 75-day remember windows by default', () => {
    assert.equal(customerStandardSessionMs(), 30 * 86_400_000);
    assert.equal(customerRememberSessionMs(), 75 * 86_400_000);
    assert.equal(customerSessionMs(false), customerStandardSessionMs());
    assert.equal(customerSessionMs(true), customerRememberSessionMs());
  });

  it('extends expiry from now for remember-me sessions', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    const expires = customerSessionExpiry(true, now);
    assert.equal(expires.getTime() - now.getTime(), 75 * 86_400_000);
  });

  it('refreshes when remaining lifetime is within 14 days', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const withinThreshold = new Date(now.getTime() + 10 * 86_400_000);
    const outsideThreshold = new Date(now.getTime() + 20 * 86_400_000);
    assert.equal(shouldRefreshCustomerSession(withinThreshold, now), true);
    assert.equal(shouldRefreshCustomerSession(outsideThreshold, now), false);
  });
});

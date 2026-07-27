import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  customerRememberSessionMs,
  customerSessionExpiry,
  customerSessionMs,
  customerSessionRefreshMinIntervalMs,
  customerStandardSessionMs,
  shouldRefreshCustomerSession,
} from '../../src/lib/auth/customerSessionPolicy';
import { shouldSlideSessionExpiry } from '../../src/lib/auth/sessionSliding';

describe('customerSessionPolicy', () => {
  it('uses 60-day standard and remember windows by default', () => {
    assert.equal(customerStandardSessionMs(), 60 * 86_400_000);
    assert.equal(customerRememberSessionMs(), 60 * 86_400_000);
    assert.equal(customerSessionMs(false), customerStandardSessionMs());
    assert.equal(customerSessionMs(true), customerRememberSessionMs());
  });

  it('extends expiry from now for remember-me sessions', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    const expires = customerSessionExpiry(true, now);
    assert.equal(expires.getTime() - now.getTime(), 60 * 86_400_000);
  });

  it('slides when remaining lifetime is within 14 days', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const withinThreshold = new Date(now.getTime() + 10 * 86_400_000);
    const lastSeen = new Date(now.getTime() - 2 * 3_600_000);
    assert.equal(shouldRefreshCustomerSession(withinThreshold, lastSeen, now), true);
    const outsideThreshold = new Date(now.getTime() + 20 * 86_400_000);
    const recentSlide = new Date(now.getTime() - 1 * 3_600_000);
    assert.equal(shouldRefreshCustomerSession(outsideThreshold, recentSlide, now), false);
  });

  it('slides active user after 24h since last extension (day 20 of 60)', () => {
    const now = new Date('2026-02-20T00:00:00.000Z');
    const expiresAt = new Date('2026-03-22T00:00:00.000Z'); // ~30d remaining
    const lastSeenAt = new Date('2026-01-21T00:00:00.000Z'); // 30d ago
    assert.equal(shouldRefreshCustomerSession(expiresAt, lastSeenAt, now), true);
    const newExpiry = customerSessionExpiry(true, now);
    assert.equal(newExpiry.getTime() - now.getTime(), 60 * 86_400_000);
  });

  it('throttles refresh within 24h when plenty of time remains', () => {
    const now = new Date('2026-01-02T00:00:00.000Z');
    const expiresAt = new Date('2026-03-03T00:00:00.000Z');
    const lastSeenAt = new Date('2026-01-01T18:00:00.000Z');
    assert.equal(shouldRefreshCustomerSession(expiresAt, lastSeenAt, now), false);
    assert.equal(customerSessionRefreshMinIntervalMs(), 24 * 3_600_000);
  });
});

describe('sessionSliding', () => {
  it('59 days remaining with stale lastSeen still slides after 24h', () => {
    const now = new Date('2026-03-01T00:00:00.000Z');
    const expiresAt = new Date(now.getTime() + 59 * 86_400_000);
    const lastSeenAt = new Date(now.getTime() - 25 * 3_600_000);
    assert.equal(
      shouldSlideSessionExpiry({
        expiresAt,
        lastSeenAt,
        refreshThresholdMs: 14 * 86_400_000,
        refreshMinIntervalMs: 24 * 3_600_000,
        now,
      }),
      true,
    );
  });
});

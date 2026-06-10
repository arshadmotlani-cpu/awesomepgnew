import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resendAvailableAt,
  secondsUntilResend,
} from '../../src/lib/auth/otpRateLimit';

describe('otp resend cooldown', () => {
  it('computes resend availability 30s after last send', () => {
    const last = new Date('2026-06-08T10:00:00.000Z');
    const available = resendAvailableAt(last, 30);
    assert.equal(available.toISOString(), '2026-06-08T10:00:30.000Z');
  });

  it('returns remaining seconds until resend is allowed', () => {
    const last = new Date('2026-06-08T10:00:00.000Z');
    const now = new Date('2026-06-08T10:00:12.000Z');
    assert.equal(secondsUntilResend(last, 30, now), 18);
    assert.equal(secondsUntilResend(last, 30, new Date('2026-06-08T10:00:45.000Z')), 0);
  });
});

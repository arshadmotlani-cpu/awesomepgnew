import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldRefreshCapitalSession } from '../../src/capital/lib/auth/sessionPolicy';
import { shouldRefreshHairSession } from '../../src/hair/lib/auth/sessionPolicy';

describe('capital session policy', () => {
  it('refreshes after 24h idle with long remaining TTL', () => {
    const now = new Date('2026-02-01T00:00:00.000Z');
    const expiresAt = new Date('2026-03-15T00:00:00.000Z');
    assert.equal(shouldRefreshCapitalSession(expiresAt, now), true);
  });
});

describe('hair session policy', () => {
  it('refreshes standard sessions on activity throttle', () => {
    const now = new Date('2026-02-01T00:00:00.000Z');
    const expiresAt = new Date('2026-03-15T00:00:00.000Z');
    assert.equal(shouldRefreshHairSession(expiresAt, false, now), true);
  });
});

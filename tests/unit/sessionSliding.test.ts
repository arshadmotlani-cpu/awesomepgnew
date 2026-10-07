import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldRefreshHairSession } from '../../src/hair/lib/auth/sessionPolicy';

describe('hair session policy', () => {
  it('refreshes standard sessions on activity throttle', () => {
    const now = new Date('2026-02-01T00:00:00.000Z');
    const expiresAt = new Date('2026-03-15T00:00:00.000Z');
    assert.equal(shouldRefreshHairSession(expiresAt, false, now), true);
  });
});

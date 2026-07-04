import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPublicAlwaysOccupiedPg } from '../../src/lib/publicPgAvailabilityOverrides';

test('public availability overrides are disabled — SSOT is authoritative', () => {
  assert.equal(isPublicAlwaysOccupiedPg({ pgSlug: 'central-avenue-male' }), false);
  assert.equal(isPublicAlwaysOccupiedPg({ pgName: 'Central Avenue (Male)' }), false);
  assert.equal(isPublicAlwaysOccupiedPg({ pgName: 'IT Park' }), false);
});

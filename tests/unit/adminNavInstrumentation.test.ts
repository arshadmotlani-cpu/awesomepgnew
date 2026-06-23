import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SLOW_NAV_MS } from '@/src/lib/admin/navInstrumentation';

test('admin nav slow threshold is 200ms', () => {
  assert.equal(SLOW_NAV_MS, 200);
});

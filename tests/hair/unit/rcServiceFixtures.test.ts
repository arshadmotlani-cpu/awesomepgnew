import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  isRcFixtureServiceCode,
  RC_SERVICE_DEFS,
} from '../../../src/hair/db/rcServiceFixtures.ts';

test('RC fixture codes are recognized and never archived by catalog sync helpers', () => {
  assert.equal(isRcFixtureServiceCode('RC-CUT'), true);
  assert.equal(isRcFixtureServiceCode('RC-BLOW'), true);
  assert.equal(isRcFixtureServiceCode('SVC-0001'), false);
  assert.equal(isRcFixtureServiceCode(null), false);
  assert.ok(RC_SERVICE_DEFS.some((s) => s.code === 'RC-BLOW'));
  assert.ok(RC_SERVICE_DEFS.every((s) => s.name.startsWith('RC ')));
});

test('catalog sync script preserves RC fixture service codes', () => {
  const src = readFileSync(
    join(process.cwd(), 'scripts/sync-official-service-catalog.ts'),
    'utf8',
  );
  assert.match(src, /isRcFixtureServiceCode/);
  assert.match(src, /continue/);
});

test('requireRcFixtures repairs bookable RC services before returning', () => {
  const src = readFileSync(
    join(process.cwd(), 'tests/hair/integration/rcFixtures.ts'),
    'utf8',
  );
  assert.match(src, /ensureRcBookableServices/);
  assert.match(src, /!cut\.isActive \|\| !blow\.isActive/);
});

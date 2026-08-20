import assert from 'node:assert/strict';
import test from 'node:test';
import { isPlatformNavActive, platformNavGroups } from '@/src/platform/lib/platformNav';

test('dashboard nav active only on exact admin root', () => {
  assert.equal(isPlatformNavActive('/platform/admin', '/platform/admin', false), true);
  assert.equal(isPlatformNavActive('/platform/admin/organizations', '/platform/admin', false), false);
});

test('organizations nav active on child routes', () => {
  assert.equal(isPlatformNavActive('/platform/admin/organizations', '/platform/admin/organizations'), true);
  assert.equal(
    isPlatformNavActive('/platform/admin/organizations/abc', '/platform/admin/organizations'),
    true,
  );
});

test('platform nav includes expected sections', () => {
  const ids = platformNavGroups.map((g) => g.id);
  assert.ok(ids.includes('overview'));
  assert.ok(ids.includes('customers'));
  assert.ok(ids.includes('revenue'));
  assert.ok(ids.includes('operations'));
  assert.ok(ids.includes('platform'));
});

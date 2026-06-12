import assert from 'node:assert/strict';
import test from 'node:test';
import { safeAdminNext } from '../../src/lib/auth/safeNext';

test('safeAdminNext keeps admin paths only', () => {
  assert.equal(safeAdminNext('/admin/pgs'), '/admin/pgs');
  assert.equal(safeAdminNext('/admin'), '/admin');
  assert.equal(safeAdminNext('https://evil.com'), '/admin');
  assert.equal(safeAdminNext('/login'), '/admin');
  assert.equal(safeAdminNext(null), '/admin');
});

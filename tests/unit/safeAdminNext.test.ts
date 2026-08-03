import assert from 'node:assert/strict';
import test from 'node:test';
import { safeAdminNext, safeNext } from '../../src/lib/auth/safeNext';

test('safeAdminNext keeps admin paths only', () => {
  assert.equal(safeAdminNext('/admin/pgs'), '/admin/pgs');
  assert.equal(safeAdminNext('/admin'), '/admin');
  assert.equal(safeAdminNext('https://evil.com'), '/admin');
  assert.equal(safeAdminNext('/login'), '/admin');
  assert.equal(safeAdminNext(null), '/admin');
});

test('safeNext rejects login loops and open redirects', () => {
  assert.equal(safeNext('/account/resident'), '/account/resident');
  assert.equal(safeNext('/login'), '/account/resident');
  assert.equal(safeNext('/login?next=/account/resident'), '/account/resident');
  assert.equal(safeNext('//evil.com'), '/account/resident');
  assert.equal(safeNext('https://evil.com'), '/account/resident');
  assert.equal(safeNext('/pgs'), '/pgs');
});

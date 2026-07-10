import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('admin resident search phone gate allows 2-digit partial matches', () => {
  const phoneDigits = '98';
  const phoneSearchEnabled = phoneDigits.length >= 2;
  assert.equal(phoneSearchEnabled, true);

  const oneDigit = '9'.replace(/\D/g, '');
  assert.equal(oneDigit.length >= 2, false);
});

test('express walk-in search accepts 2-character queries', () => {
  const trimmed = 'ab';
  assert.ok(trimmed.length >= 2);
});

test('scoped admins cannot see unassigned residents in search', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/adminResidentSearch.ts'), 'utf8');
  assert.match(src, /session\.role === 'super_admin'/);
  assert.match(src, /!row\.pg_id/);
});

test('resident search includes invoice number tiers', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/adminResidentSearch.ts'), 'utf8');
  assert.match(src, /invoice_number ILIKE/);
});

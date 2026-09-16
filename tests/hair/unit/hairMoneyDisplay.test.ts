import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatInrFromPaise,
  formatInrPlainFromPaise,
  formatRupeeInputFromPaise,
} from '@/src/hair/lib/money';

test('whole rupees omit unnecessary decimals', () => {
  assert.equal(formatInrFromPaise(60_000), '₹600');
  assert.equal(formatInrFromPaise(170_000), '₹1,700');
  assert.equal(formatInrFromPaise(0), '₹0');
  assert.equal(formatInrPlainFromPaise(60_000), '₹600');
});

test('non-zero paise preserved in display', () => {
  assert.equal(formatInrFromPaise(60_050), '₹600.50');
  assert.equal(formatInrFromPaise(1), '₹0.01');
  assert.equal(formatRupeeInputFromPaise(60_050), '600.50');
  assert.equal(formatRupeeInputFromPaise(60_000), '600');
});

test('Quick Sale basket uses shared rupee input formatter', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(process.cwd(), 'src/hair/components/quick-sale/QuickSaleBasketTable.tsx'),
    'utf8',
  );
  assert.match(src, /formatRupeeInputFromPaise/);
  assert.doesNotMatch(src, /toFixed\(2\)/);
});

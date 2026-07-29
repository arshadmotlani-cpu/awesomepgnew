import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAttributionRows,
  discountBpsFromPaise,
  discountPaiseFromBps,
  normalizeEqualShares,
} from '../../../src/hair/lib/attributionMath.ts';

test('normalizeEqualShares splits 10000 bps', () => {
  const shares = normalizeEqualShares(['a', 'b']);
  assert.equal(shares.reduce((s, x) => s + x.shareBps!, 0), 10_000);
});

test('discount bps and paise round-trip', () => {
  const gross = 10_000;
  const bps = 1500;
  const paise = discountPaiseFromBps(gross, bps);
  assert.equal(discountBpsFromPaise(gross, paise), bps);
});

test('service line dual serviced_by attribution', () => {
  const rows = buildAttributionRows({
    kind: 'service',
    lineNetPaise: 10_000,
    servicedBy: [{ staffId: 's1' }, { staffId: 's2' }],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows.reduce((s, r) => s + r.attributedNetPaise, 0), 10_000);
});

test('service line custom share bps', () => {
  const rows = buildAttributionRows({
    kind: 'service',
    lineNetPaise: 10_000,
    servicedBy: [
      { staffId: 's1', shareBps: 7000 },
      { staffId: 's2', shareBps: 3000 },
    ],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.shareBps, 7000);
  assert.equal(rows.reduce((s, r) => s + r.attributedNetPaise, 0), 10_000);
});

test('product sold_by attribution', () => {
  const rows = buildAttributionRows({
    kind: 'product',
    lineNetPaise: 5000,
    soldByStaffId: 'seller',
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.role, 'sold_by');
  assert.equal(rows[0]!.revenueMetric, 'product');
});

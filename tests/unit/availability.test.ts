import { strict as assert } from 'node:assert';
import test from 'node:test';
import { parseDate } from '../../src/lib/dates';
import { computeFreeWindows, maxCheckoutForCheckIn, parseDaterange, validateStayWithinFreeWindows } from '../../src/services/availability';

// ───────────────────────────────────────────────────────────────────────────
// parseDaterange
// ───────────────────────────────────────────────────────────────────────────

test('parseDaterange: standard half-open [start, end)', () => {
  const r = parseDaterange('[2026-06-01,2026-06-10)');
  assert.equal(r.lower?.toISOString(), '2026-06-01T00:00:00.000Z');
  assert.equal(r.upper?.toISOString(), '2026-06-10T00:00:00.000Z');
  assert.equal(r.lowerInc, true);
  assert.equal(r.upperInc, false);
});

test('parseDaterange: empty range', () => {
  const r = parseDaterange('empty');
  assert.equal(r.lower, null);
  assert.equal(r.upper, null);
});

test('parseDaterange: unbounded upper', () => {
  const r = parseDaterange('[2026-06-01,)');
  assert.equal(r.lower?.toISOString(), '2026-06-01T00:00:00.000Z');
  assert.equal(r.upper, null);
});

test('parseDaterange: handles quoted dates (postgres alt form)', () => {
  const r = parseDaterange('["2026-06-01","2026-06-10")');
  assert.equal(r.lower?.toISOString(), '2026-06-01T00:00:00.000Z');
  assert.equal(r.upper?.toISOString(), '2026-06-10T00:00:00.000Z');
});

test('parseDaterange: rejects malformed input', () => {
  assert.throws(() => parseDaterange('not-a-range'), /Cannot parse daterange/);
});

// ───────────────────────────────────────────────────────────────────────────
// computeFreeWindows
// ───────────────────────────────────────────────────────────────────────────

function busy(start: string, end: string) {
  return { start: parseDate(start), end: parseDate(end) };
}

test('computeFreeWindows: no busy intervals → whole window is free', () => {
  const r = computeFreeWindows([], '2026-06-01', '2026-07-01');
  assert.equal(r.length, 1);
  assert.equal(r[0].startDate, '2026-06-01');
  assert.equal(r[0].endDate, '2026-07-01');
  assert.equal(r[0].nights, 30);
});

test('computeFreeWindows: single busy interval in the middle splits the window', () => {
  const r = computeFreeWindows(
    [busy('2026-06-10', '2026-06-15')],
    '2026-06-01',
    '2026-07-01',
  );
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { startDate: '2026-06-01', endDate: '2026-06-10', nights: 9 });
  assert.deepEqual(r[1], { startDate: '2026-06-15', endDate: '2026-07-01', nights: 16 });
});

test('computeFreeWindows: busy at the very start trims left edge', () => {
  const r = computeFreeWindows(
    [busy('2026-06-01', '2026-06-05')],
    '2026-06-01',
    '2026-07-01',
  );
  assert.equal(r.length, 1);
  assert.deepEqual(r[0], { startDate: '2026-06-05', endDate: '2026-07-01', nights: 26 });
});

test('computeFreeWindows: busy spanning the entire window → no free time', () => {
  const r = computeFreeWindows(
    [busy('2026-05-01', '2026-08-01')],
    '2026-06-01',
    '2026-07-01',
  );
  assert.equal(r.length, 0);
});

test('computeFreeWindows: adjacent busy intervals do not produce zero-night gaps', () => {
  const r = computeFreeWindows(
    [busy('2026-06-10', '2026-06-15'), busy('2026-06-15', '2026-06-20')],
    '2026-06-01',
    '2026-07-01',
  );
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { startDate: '2026-06-01', endDate: '2026-06-10', nights: 9 });
  assert.deepEqual(r[1], { startDate: '2026-06-20', endDate: '2026-07-01', nights: 11 });
});

test('computeFreeWindows: overlapping busy intervals are merged before gap math', () => {
  const r = computeFreeWindows(
    [busy('2026-06-10', '2026-06-20'), busy('2026-06-15', '2026-06-25')],
    '2026-06-01',
    '2026-07-01',
  );
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { startDate: '2026-06-01', endDate: '2026-06-10', nights: 9 });
  assert.deepEqual(r[1], { startDate: '2026-06-25', endDate: '2026-07-01', nights: 6 });
});

test('computeFreeWindows: unsorted busy intervals are sorted internally', () => {
  const r = computeFreeWindows(
    [busy('2026-06-20', '2026-06-25'), busy('2026-06-05', '2026-06-10')],
    '2026-06-01',
    '2026-07-01',
  );
  assert.equal(r.length, 3);
  assert.deepEqual(r[0], { startDate: '2026-06-01', endDate: '2026-06-05', nights: 4 });
  assert.deepEqual(r[1], { startDate: '2026-06-10', endDate: '2026-06-20', nights: 10 });
  assert.deepEqual(r[2], { startDate: '2026-06-25', endDate: '2026-07-01', nights: 6 });
});

test('computeFreeWindows: busy outside the window is ignored', () => {
  const r = computeFreeWindows(
    [busy('2026-05-01', '2026-05-15'), busy('2026-08-01', '2026-08-15')],
    '2026-06-01',
    '2026-07-01',
  );
  assert.equal(r.length, 1);
  assert.deepEqual(r[0], { startDate: '2026-06-01', endDate: '2026-07-01', nights: 30 });
});

test('computeFreeWindows: empty window returns []', () => {
  assert.deepEqual(computeFreeWindows([busy('2026-06-01', '2026-06-10')], '2026-07-01', '2026-07-01'), []);
});

test('maxCheckoutForCheckIn: returns window end when check-in is inside', () => {
  const windows = computeFreeWindows([busy('2026-06-10', '2026-06-15')], '2026-06-01', '2026-07-01');
  assert.equal(maxCheckoutForCheckIn('2026-06-05', windows), '2026-06-10');
  assert.equal(maxCheckoutForCheckIn('2026-06-20', windows), '2026-07-01');
  assert.equal(maxCheckoutForCheckIn('2026-06-12', windows), null);
});

test('validateStayWithinFreeWindows: rejects stay past cap', () => {
  const windows = computeFreeWindows([busy('2026-06-10', '2026-06-20')], '2026-06-01', '2026-07-01');
  const ok = validateStayWithinFreeWindows('2026-06-01', '2026-06-10', windows);
  assert.equal(ok.ok, true);
  const bad = validateStayWithinFreeWindows('2026-06-01', '2026-06-25', windows);
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.equal(bad.reason, 'exceeds_cap');
    assert.equal(bad.maxCheckout, '2026-06-10');
  }
});

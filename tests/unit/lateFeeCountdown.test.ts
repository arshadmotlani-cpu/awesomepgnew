import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLateFeeCountdown } from '../../src/lib/billing/lateFeeCountdown';

test('grace countdown shows days remaining before late fee', () => {
  const state = buildLateFeeCountdown('2026-08-01', '2026-08-01');
  assert.equal(state.phase, 'grace');
  if (state.phase !== 'grace') return;
  assert.equal(state.daysUntilLateFee, 4);
  assert.match(state.message, /4 days left before late fee starts/);
});

test('grace countdown shows last-day message', () => {
  const state = buildLateFeeCountdown('2026-08-01', '2026-08-05');
  assert.equal(state.phase, 'grace');
  if (state.phase !== 'grace') return;
  assert.equal(state.daysUntilLateFee, 0);
  assert.equal(state.message, 'Last day to pay without late fee');
});

test('late phase shows percent today and tomorrow', () => {
  const state = buildLateFeeCountdown('2026-08-01', '2026-08-06');
  assert.equal(state.phase, 'late');
  if (state.phase !== 'late') return;
  assert.equal(state.percentToday, 1);
  assert.equal(state.percentTomorrow, 2);
  assert.match(state.message, /Late fee: 1% applied/);
});

test('mid-month issue countdown matches 10th example', () => {
  const state = buildLateFeeCountdown('2026-08-10', '2026-08-12');
  assert.equal(state.phase, 'grace');
  if (state.phase !== 'grace') return;
  assert.equal(state.daysUntilLateFee, 2);
  assert.match(state.message, /2 days left before late fee starts/);
});

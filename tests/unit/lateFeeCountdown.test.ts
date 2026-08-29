import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLateFeeCountdown } from '../../src/lib/billing/lateFeeCountdown';

test('grace countdown shows days remaining before late fee', () => {
  const state = buildLateFeeCountdown('2026-08-01', '2026-08-01');
  assert.equal(state.phase, 'grace');
  if (state.phase !== 'grace') return;
  assert.equal(state.daysUntilLateFee, 4);
  assert.match(state.message, /Due in 4 days/);
});

test('grace countdown shows last-day message', () => {
  const state = buildLateFeeCountdown('2026-08-01', '2026-08-05');
  assert.equal(state.phase, 'grace');
  if (state.phase !== 'grace') return;
  assert.equal(state.daysUntilLateFee, 0);
  assert.equal(state.message, 'Due today');
});

test('late phase shows percent today and overdue copy', () => {
  const state = buildLateFeeCountdown('2026-08-01', '2026-08-06');
  assert.equal(state.phase, 'late');
  if (state.phase !== 'late') return;
  assert.equal(state.percentToday, 1);
  assert.equal(state.percentTomorrow, 2);
  assert.match(state.message, /1 day overdue/);
  assert.match(state.message, /Late fee 1%/);
});

test('mid-month issue countdown matches 10th example', () => {
  const state = buildLateFeeCountdown('2026-08-10', '2026-08-12');
  assert.equal(state.phase, 'grace');
  if (state.phase !== 'grace') return;
  assert.equal(state.daysUntilLateFee, 2);
  assert.match(state.message, /Due in 2 days/);
});

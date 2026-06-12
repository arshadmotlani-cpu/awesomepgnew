import assert from 'node:assert/strict';
import test from 'node:test';
import { PS4_PLANS, isPs4PlanId, planRank } from '../../src/lib/playstation/plans';

test('PS4 plans have correct pricing and durations', () => {
  assert.equal(PS4_PLANS.weekly.pricePaise, 35_000);
  assert.equal(PS4_PLANS.weekly.durationDays, 7);
  assert.equal(PS4_PLANS.biweekly.pricePaise, 60_000);
  assert.equal(PS4_PLANS.biweekly.durationDays, 14);
  assert.equal(PS4_PLANS.monthly.pricePaise, 80_000);
  assert.equal(PS4_PLANS.monthly.durationDays, 30);
});

test('isPs4PlanId validates plan ids', () => {
  assert.equal(isPs4PlanId('weekly'), true);
  assert.equal(isPs4PlanId('monthly'), true);
  assert.equal(isPs4PlanId('yearly'), false);
});

test('planRank orders plans for upgrades', () => {
  assert.ok(planRank('monthly') > planRank('biweekly'));
  assert.ok(planRank('biweekly') > planRank('weekly'));
});

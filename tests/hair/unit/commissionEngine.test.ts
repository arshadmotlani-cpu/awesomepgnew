import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeFromRuleConfig,
  percentOnAttributed,
  scaleFixedByShare,
} from '../../../src/hair/services/commissionEngine.ts';
import { summaryTotalPaise } from '../../../src/hair/services/staffPerformance.ts';

test('scaleFixedByShare applies shareBps proportionally', () => {
  assert.equal(scaleFixedByShare(10_000, 7000), 7000);
  assert.equal(scaleFixedByShare(10_000, 3000), 3000);
});

test('percentOnAttributed uses attributed net not gross line', () => {
  assert.equal(percentOnAttributed(70_000, 1000), 7000);
});

test('flat_percent rule on attributed net', () => {
  const amount = computeFromRuleConfig(
    { kind: 'flat_percent', percentBps: 1500 },
    80_000,
    10_000,
    'serviced_by',
  );
  assert.equal(amount, 12_000);
});

test('flat_amount rule scales by shareBps', () => {
  const amount = computeFromRuleConfig(
    { kind: 'flat_amount', amountPaise: 5000 },
    80_000,
    5000,
    'serviced_by',
  );
  assert.equal(amount, 2500);
});

test('role_based rule ignores mismatched role', () => {
  const amount = computeFromRuleConfig(
    { kind: 'role_based', role: 'sold_by', percentBps: 2000 },
    50_000,
    10_000,
    'serviced_by',
  );
  assert.equal(amount, 0);
});

test('tiered_percent picks highest qualifying tier', () => {
  const amount = computeFromRuleConfig(
    {
      kind: 'tiered_percent',
      tiers: [
        { minNetPaise: 0, percentBps: 500 },
        { minNetPaise: 50_000, percentBps: 1000 },
      ],
    },
    60_000,
    10_000,
    'serviced_by',
  );
  assert.equal(amount, 6000);
});

test('summaryTotalPaise sums all revenue metrics', () => {
  assert.equal(
    summaryTotalPaise({
      serviceRevenuePaise: 100,
      productRevenuePaise: 200,
      packageRevenuePaise: 50,
      membershipRevenuePaise: 25,
    }),
    375,
  );
});

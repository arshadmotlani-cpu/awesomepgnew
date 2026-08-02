import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyLateFeePolicy,
  chargeableOverdueDays,
  computeLateFeeWithPolicy,
  legacyLateFeePaise,
  type LateFeePolicySnapshot,
} from '../../src/services/lateFeePolicy';
import { computeLateFee } from '../../src/services/billing';

const percent1: LateFeePolicySnapshot = {
  type: 'percent_of_principal',
  amountPaise: null,
  percentBps: 100,
  graceDays: 0,
  maxFeePaise: null,
  appliesTo: 'both',
};

const fixed50: LateFeePolicySnapshot = {
  type: 'fixed_per_day',
  amountPaise: 50_00,
  percentBps: null,
  graceDays: 0,
  maxFeePaise: null,
  appliesTo: 'rent',
};

test('legacy late fee matches 1%/day', () => {
  const rent = 6_00_000;
  assert.equal(legacyLateFeePaise(rent, 0), 0);
  assert.equal(legacyLateFeePaise(rent, 1), 60_00);
  assert.equal(legacyLateFeePaise(rent, 2), 120_00);
});

test('percent policy with grace 0 matches legacy', () => {
  const rent = 6_00_000;
  assert.equal(
    applyLateFeePolicy({ principalPaise: rent, overdueDays: 1, policy: percent1 }),
    60_00,
  );
  assert.equal(
    computeLateFeeWithPolicy({
      principalPaise: rent,
      dueDate: '2026-07-15',
      today: '2026-07-16',
      policy: percent1,
    }),
    computeLateFee({ rentPaise: rent, dueDate: '2026-07-15', today: '2026-07-16' }),
  );
});

test('grace days reduce chargeable overdue', () => {
  assert.equal(chargeableOverdueDays(3, 2), 1);
  assert.equal(chargeableOverdueDays(2, 2), 0);
  const withGrace: LateFeePolicySnapshot = { ...percent1, graceDays: 2 };
  const rent = 6_00_000;
  assert.equal(
    applyLateFeePolicy({ principalPaise: rent, overdueDays: 2, policy: withGrace }),
    0,
  );
  assert.equal(
    applyLateFeePolicy({ principalPaise: rent, overdueDays: 3, policy: withGrace }),
    60_00,
  );
});

test('fixed_per_day policy', () => {
  assert.equal(
    applyLateFeePolicy({ principalPaise: 1_000_000, overdueDays: 3, policy: fixed50 }),
    150_00,
  );
});

test('max fee cap', () => {
  const capped: LateFeePolicySnapshot = { ...percent1, maxFeePaise: 100_00 };
  const rent = 6_00_000;
  assert.equal(
    applyLateFeePolicy({ principalPaise: rent, overdueDays: 5, policy: capped }),
    100_00,
  );
});

test('issueDate policy path matches generation-date computeLateFee', () => {
  const rent = 6_00_000;
  assert.equal(
    computeLateFeeWithPolicy({
      principalPaise: rent,
      issueDate: '2026-08-01',
      today: '2026-08-06',
      policy: percent1,
    }),
    computeLateFee({ rentPaise: rent, issueDate: '2026-08-01', today: '2026-08-06' }),
  );
});

test('null policy falls back to legacy 1%', () => {
  const rent = 6_00_000;
  assert.equal(
    computeLateFeeWithPolicy({
      principalPaise: rent,
      dueDate: '2026-06-05',
      today: '2026-06-07',
      policy: null,
    }),
    120_00,
  );
  assert.equal(
    computeLateFee({
      rentPaise: rent,
      dueDate: '2026-06-05',
      today: '2026-06-07',
      policy: percent1,
    }),
    120_00,
  );
});

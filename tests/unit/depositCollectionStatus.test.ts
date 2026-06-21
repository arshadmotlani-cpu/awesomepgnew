import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  classifyDepositCollection,
  depositOutstandingPaise,
} from '../../src/lib/deposits/depositCollectionStatus.ts';

test('treats zero required as requirement_missing, not paid', () => {
  assert.equal(
    classifyDepositCollection({
      requiredDepositPaise: 0,
      depositDuePaise: 0,
      paidAmountPaise: 0,
    }),
    'requirement_missing',
  );
});

test('classifies fully paid resident', () => {
  assert.equal(
    classifyDepositCollection({
      requiredDepositPaise: 600_000,
      depositDuePaise: 0,
      paidAmountPaise: 600_000,
    }),
    'paid',
  );
});

test('classifies partial or unpaid as pending', () => {
  assert.equal(
    classifyDepositCollection({
      requiredDepositPaise: 500_000,
      depositDuePaise: 200_000,
      paidAmountPaise: 300_000,
    }),
    'pending',
  );
});

test('returns zero outstanding when requirement missing', () => {
  assert.equal(
    depositOutstandingPaise({
      requiredDepositPaise: 0,
      depositDuePaise: 0,
      paidAmountPaise: 0,
    }),
    0,
  );
});

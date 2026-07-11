import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcHoldingDays,
  calcRoiBps,
  calcSettlementPctBps,
  formatInr,
  normalizeRegistration,
  rupeesToPaise,
} from '../../../src/capital/lib/money';

describe('capital money utils', () => {
  it('converts rupees to paise', () => {
    assert.equal(rupeesToPaise(100.5), 10050);
  });

  it('formats INR', () => {
    assert.match(formatInr(10000000), /₹/);
  });

  it('calculates ROI basis points', () => {
    assert.equal(calcRoiBps(50000, 200000), 2500);
  });

  it('calculates holding days', () => {
    assert.equal(calcHoldingDays('2026-01-01', '2026-01-31'), 30);
  });

  it('calculates settlement percent', () => {
    assert.equal(calcSettlementPctBps(50000, 100000), 5000);
  });

  it('normalizes registration', () => {
    assert.equal(normalizeRegistration('mh 12 ab 1234'), 'MH12AB1234');
  });
});

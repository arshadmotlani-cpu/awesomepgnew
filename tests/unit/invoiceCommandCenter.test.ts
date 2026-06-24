import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canNavigateNextDay,
  formatSelectedDayLabel,
  resolveSelectedDay,
  shiftSelectedDay,
} from '@/src/lib/billing/dayNavigation';
import { computeInvoiceDailyNetRevenue } from '@/src/services/invoiceCommandCenter';

test('computeInvoiceDailyNetRevenue sums invoice-first inflows minus refunds', () => {
  const net = computeInvoiceDailyNetRevenue({
    rentCollectedPaise: 190_000,
    depositsCollectedPaise: 111_500,
    electricityCollectedPaise: 12_000,
    refundsPaidPaise: 25_000,
  });
  assert.equal(net, 288_500);
});

test('resolveSelectedDay caps future dates at today', () => {
  const today = resolveSelectedDay(null);
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(resolveSelectedDay('2099-12-31'), today);
});

test('shiftSelectedDay moves calendar days', () => {
  assert.equal(shiftSelectedDay('2026-06-15', -1), '2026-06-14');
  assert.equal(shiftSelectedDay('2026-06-15', 1), '2026-06-16');
});

test('canNavigateNextDay is false when viewing today', () => {
  const today = resolveSelectedDay(null);
  assert.equal(canNavigateNextDay(today), false);
  assert.equal(canNavigateNextDay(shiftSelectedDay(today, -1)), true);
});

test('formatSelectedDayLabel includes Today prefix for current day', () => {
  const today = resolveSelectedDay(null);
  assert.match(formatSelectedDayLabel(today), /^Today · /);
});

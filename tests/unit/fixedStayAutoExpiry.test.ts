import assert from 'node:assert/strict';
import test from 'node:test';
import { isPastFixedStayCheckout, toIstParts } from '../../src/lib/dates/ist';

test('toIstParts returns IST calendar date for UTC midnight boundary', () => {
  const parts = toIstParts(new Date('2026-06-10T05:29:00.000Z'));
  assert.equal(parts.dateYmd, '2026-06-10');
  assert.equal(parts.hour, 10);
  assert.equal(parts.minute, 59);
});

test('isPastFixedStayCheckout false before 11 AM IST on checkout date', () => {
  const checkout = '2026-06-10';
  const before = new Date('2026-06-10T05:29:00.000Z');
  assert.equal(isPastFixedStayCheckout(checkout, before), false);
});

test('isPastFixedStayCheckout true at 11 AM IST on checkout date', () => {
  const checkout = '2026-06-10';
  const atEleven = new Date('2026-06-10T05:30:00.000Z');
  assert.equal(isPastFixedStayCheckout(checkout, atEleven), true);
});

test('isPastFixedStayCheckout true after checkout date', () => {
  const checkout = '2026-06-09';
  const nextDay = new Date('2026-06-10T05:00:00.000Z');
  assert.equal(isPastFixedStayCheckout(checkout, nextDay), true);
});

test('isPastFixedStayCheckout false on day before checkout', () => {
  const checkout = '2026-06-11';
  const dayBefore = new Date('2026-06-10T12:00:00.000Z');
  assert.equal(isPastFixedStayCheckout(checkout, dayBefore), false);
});

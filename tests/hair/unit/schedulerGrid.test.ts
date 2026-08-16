import assert from 'node:assert/strict';
import test from 'node:test';
import { SLOT_MIN, snapMinutes, slotCountBetween, minutesToSlotLabel } from '../../../src/hair/components/appointments/schedulerConstants.ts';
import { clampAndSnapStartMinutes } from '../../../src/hair/components/appointments/schedulerTime.ts';

test('snapMinutes rounds to 30-minute grid', () => {
  assert.equal(snapMinutes(0), 0);
  assert.equal(snapMinutes(14), 0);
  assert.equal(snapMinutes(15), 30);
  assert.equal(snapMinutes(44), 30);
  assert.equal(snapMinutes(45), 60);
});

test('slotCountBetween counts 30-min slots in business hours', () => {
  assert.equal(slotCountBetween(10, 20), 20);
  assert.equal(slotCountBetween(10, 11), 2);
});

test('minutesToSlotLabel formats HH:mm', () => {
  assert.equal(minutesToSlotLabel(10 * 60), '10:00');
  assert.equal(minutesToSlotLabel(10 * 60 + 30), '10:30');
});

test('clampAndSnapStartMinutes respects day bounds', () => {
  assert.equal(clampAndSnapStartMinutes(9 * 60 + 15, 10, 20), 10 * 60);
  assert.equal(clampAndSnapStartMinutes(19 * 60 + 45, 10, 20), 19 * 60 + 30);
  assert.equal(SLOT_MIN, 30);
});

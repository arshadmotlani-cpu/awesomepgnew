import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldCountStaffForWorkingToday } from '../../../src/hair/lib/staffWorkingToday.ts';

test('shouldCountStaffForWorkingToday excludes inactive staff', () => {
  assert.equal(
    shouldCountStaffForWorkingToday({
      isActive: false,
      hasAppointmentToday: true,
      scheduleIsOff: null,
    }),
    false,
  );
});

test('shouldCountStaffForWorkingToday excludes approved leave (isOff)', () => {
  assert.equal(
    shouldCountStaffForWorkingToday({
      isActive: true,
      hasAppointmentToday: true,
      scheduleIsOff: true,
    }),
    false,
  );
});

test('shouldCountStaffForWorkingToday requires an appointment today', () => {
  assert.equal(
    shouldCountStaffForWorkingToday({
      isActive: true,
      hasAppointmentToday: false,
      scheduleIsOff: null,
    }),
    false,
  );
});

test('shouldCountStaffForWorkingToday counts active scheduled stylist', () => {
  assert.equal(
    shouldCountStaffForWorkingToday({
      isActive: true,
      hasAppointmentToday: true,
      scheduleIsOff: false,
    }),
    true,
  );
});

test('shouldCountStaffForWorkingToday counts when no schedule row exists', () => {
  assert.equal(
    shouldCountStaffForWorkingToday({
      isActive: true,
      hasAppointmentToday: true,
      scheduleIsOff: null,
    }),
    true,
  );
});

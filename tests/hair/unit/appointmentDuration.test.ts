import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasCustomAppointmentDuration,
  snapshotDurationMinutes,
  slotDurationMinutes,
} from '../../../src/hair/components/appointments/schedulerDuration.ts';

test('snapshotDurationMinutes sums service lines', () => {
  assert.equal(
    snapshotDurationMinutes([{ durationMinutes: 30 }, { durationMinutes: 45 }]),
    75,
  );
});

test('hasCustomAppointmentDuration when slot differs from catalog snapshot', () => {
  const start = '2026-08-01T10:00:00.000Z';
  const endCatalog = '2026-08-01T10:30:00.000Z';
  const endCustom = '2026-08-01T11:00:00.000Z';
  const services = [{ durationMinutes: 30 }];

  assert.equal(hasCustomAppointmentDuration(start, endCatalog, services), false);
  assert.equal(hasCustomAppointmentDuration(start, endCustom, services), true);
});

test('slotDurationMinutes from ISO range', () => {
  const start = '2026-08-01T10:00:00.000Z';
  const end = '2026-08-01T11:00:00.000Z';
  assert.equal(slotDurationMinutes(start, end), 60);
});

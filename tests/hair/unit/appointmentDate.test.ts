/**
 * Appointment scheduler date resolution — salon timezone, no UTC day bleed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAppointmentsHref,
  isValidAppointmentDayIso,
  resolveAppointmentDate,
  salonTodayKey,
} from '@/src/hair/lib/appointmentDate';
import { addDaysIso } from '@/src/hair/components/appointments/schedulerTime';

test('resolveAppointmentDate — no URL date uses salon today (2026-08-18)', () => {
  const now = new Date('2026-08-18T06:00:00Z'); // 11:30 IST
  assert.equal(
    resolveAppointmentDate({ explicitUrlDate: undefined, now, timezone: 'Asia/Kolkata' }),
    '2026-08-18',
  );
});

test('resolveAppointmentDate — no URL date uses salon today (2026-08-19)', () => {
  const now = new Date('2026-08-19T06:00:00Z');
  assert.equal(
    resolveAppointmentDate({ explicitUrlDate: undefined, now, timezone: 'Asia/Kolkata' }),
    '2026-08-19',
  );
});

test('resolveAppointmentDate — explicit URL date wins over today', () => {
  const now = new Date('2026-08-18T06:00:00Z');
  assert.equal(
    resolveAppointmentDate({
      explicitUrlDate: '2026-08-17',
      now,
      timezone: 'Asia/Kolkata',
    }),
    '2026-08-17',
  );
});

test('salon today around India midnight — still local calendar day', () => {
  // 18 Aug 2026 00:30 IST = 17 Aug 2026 19:00 UTC
  const now = new Date('2026-08-17T19:00:00Z');
  assert.equal(salonTodayKey('Asia/Kolkata', now), '2026-08-18');
});

test('salon today late evening India — not previous UTC day', () => {
  // 18 Aug 2026 23:30 IST = 18 Aug 2026 18:00 UTC
  const now = new Date('2026-08-18T18:00:00Z');
  assert.equal(salonTodayKey('Asia/Kolkata', now), '2026-08-18');
});

test('prev/next day navigation from anchor', () => {
  assert.equal(addDaysIso('2026-08-18', -1), '2026-08-17');
  assert.equal(addDaysIso('2026-08-18', 1), '2026-08-19');
});

test('buildAppointmentsHref always includes explicit date', () => {
  assert.equal(buildAppointmentsHref('2026-08-18'), '/appointments?date=2026-08-18');
  assert.equal(
    buildAppointmentsHref('2026-08-18', { customerId: 'abc' }),
    '/appointments?date=2026-08-18&customerId=abc',
  );
});

test('isValidAppointmentDayIso rejects invalid values', () => {
  assert.equal(isValidAppointmentDayIso('2026-08-18'), true);
  assert.equal(isValidAppointmentDayIso('2026-8-18'), false);
  assert.equal(isValidAppointmentDayIso(''), false);
  assert.equal(isValidAppointmentDayIso(null), false);
});

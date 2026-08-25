import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhAppointmentServices, fyhAppointments } from '@/src/hair/db/schema';
import { rescheduleAppointment, updateAppointment } from '@/src/hair/services/appointments';
import { createAppointmentNextSlot } from './appointmentTestHelpers.ts';
import { createRcCustomer, requireRcFixtures } from './rcFixtures.ts';
import { migrationSkipMessage, probeHairQuickSaleMigrations } from './migrationGuard.ts';

test('updateAppointment swaps services and recalculates end when not custom duration', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const f = await requireRcFixtures();
  const customer = await createRcCustomer('appt-upd');

  const apptId = await createAppointmentNextSlot({
    customerId: customer.id,
    staffId: f.staff.id,
    serviceIds: [f.cut.id],
    source: 'booking',
  });

  const [before] = await hairDb
    .select()
    .from(fyhAppointments)
    .where(eq(fyhAppointments.id, apptId))
    .limit(1);
  const origDuration = before!.endAt.getTime() - before!.startAt.getTime();

  await updateAppointment({
    id: apptId,
    serviceIds: [f.cut.id, f.blow.id],
  });

  const [after] = await hairDb
    .select()
    .from(fyhAppointments)
    .where(eq(fyhAppointments.id, apptId))
    .limit(1);
  const lines = await hairDb
    .select()
    .from(fyhAppointmentServices)
    .where(eq(fyhAppointmentServices.appointmentId, apptId));

  assert.equal(lines.length, 2);
  assert.ok(after!.endAt.getTime() - after!.startAt.getTime() > origDuration);
});

test('updateAppointment preserves custom slot duration on service change', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const f = await requireRcFixtures();
  const customer = await createRcCustomer('appt-custom');

  const apptId = await createAppointmentNextSlot({
    customerId: customer.id,
    staffId: f.staff.id,
    serviceIds: [f.cut.id],
    source: 'booking',
  });

  const [created] = await hairDb
    .select()
    .from(fyhAppointments)
    .where(eq(fyhAppointments.id, apptId))
    .limit(1);
  const extendedEnd = new Date(created!.endAt.getTime() + 30 * 60_000);
  await rescheduleAppointment({
    id: apptId,
    startAt: created!.startAt,
    endAt: extendedEnd,
  });

  await updateAppointment({
    id: apptId,
    serviceIds: [f.blow.id],
  });

  const [after] = await hairDb
    .select()
    .from(fyhAppointments)
    .where(eq(fyhAppointments.id, apptId))
    .limit(1);

  assert.equal(
    after!.endAt.getTime() - after!.startAt.getTime(),
    extendedEnd.getTime() - created!.startAt.getTime(),
  );
});

test('updateAppointment rejects a different client and still allows other field edits', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const f = await requireRcFixtures();
  const customer = await createRcCustomer('appt-client-lock');
  const other = await createRcCustomer('appt-client-lock-2');
  const apptId = await createAppointmentNextSlot({
    customerId: customer.id,
    staffId: f.staff.id,
    serviceIds: [f.cut.id],
    source: 'booking',
  });

  await assert.rejects(
    () => updateAppointment({ id: apptId, customerId: other.id }),
    /Cannot change client on an existing appointment/,
  );

  await updateAppointment({ id: apptId, customerId: customer.id, notes: 'same client ok' });
  await updateAppointment({ id: apptId, serviceIds: [f.blow.id], notes: 'other fields ok' });

  const [row] = await hairDb
    .select()
    .from(fyhAppointments)
    .where(eq(fyhAppointments.id, apptId))
    .limit(1);
  assert.equal(row!.customerId, customer.id);
  assert.equal(row!.notes, 'other fields ok');
});

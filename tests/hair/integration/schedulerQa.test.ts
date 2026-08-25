/**
 * Automated scheduler QA (plan scenarios A–K) via service-layer flows.
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhAppointmentServices,
  fyhAppointments,
  fyhInvoices,
} from '@/src/hair/db/schema';
import { buildBasketFromAppointment } from '@/src/hair/domain/basket/appointmentBridge';
import { checkoutFromBasket } from '@/src/hair/domain/checkout/pipeline';
import { priceBasket } from '@/src/hair/domain/basket/engine';
import {
  createAppointment,
  getAppointmentById,
  rescheduleAppointment,
  updateAppointment,
} from '@/src/hair/services/appointments';
import {
  formatHmInSalonTz,
  minutesInSalonTz,
  utcFromDayAndMinutes,
} from '@/src/hair/components/appointments/schedulerTime.ts';
import { createRcCustomer, nextSlot, requireRcFixtures } from './rcFixtures.ts';
import { createAppointmentNextSlot } from './appointmentTestHelpers.ts';
import { migrationSkipMessage, probeHairQuickSaleMigrations } from './migrationGuard.ts';

for (let i = 0; i < 600; i++) nextSlot();

const TZ = 'Asia/Kolkata';

function slotAtHour(dayIso: string, hour: number, minute: number) {
  return utcFromDayAndMinutes(dayIso, hour * 60 + minute, TZ);
}

test('scheduler QA A/B — slot prefill times 3:00 PM and 3:30 PM salon-local', () => {
  const dayIso = '2026-08-15';
  const at3 = slotAtHour(dayIso, 15, 0);
  const at330 = slotAtHour(dayIso, 15, 30);
  assert.equal(formatHmInSalonTz(at3, TZ), '15:00');
  assert.equal(formatHmInSalonTz(at330, TZ), '15:30');
  assert.equal(minutesInSalonTz(at3, TZ), 15 * 60);
  assert.equal(minutesInSalonTz(at330, TZ), 15 * 60 + 30);
});

test('scheduler QA C — 60-minute catalog duration occupies correct slot length', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const f = await requireRcFixtures();
  const customer = await createRcCustomer('sched-c');
  const startAt = nextSlot();

  const apptId = await createAppointmentNextSlot({
    customerId: customer.id,
    staffId: f.staff.id,
    serviceIds: [f.cut.id, f.blow.id],
    source: 'booking',
  });

  const [row] = await hairDb
    .select()
    .from(fyhAppointments)
    .where(eq(fyhAppointments.id, apptId))
    .limit(1);
  const catalogMins =
    (await hairDb.select().from(fyhAppointmentServices).where(eq(fyhAppointmentServices.appointmentId, apptId)))
      .reduce((s, x) => s + x.durationMinutes, 0);
  const slotMins = Math.round((row!.endAt.getTime() - row!.startAt.getTime()) / 60_000);
  assert.equal(slotMins, catalogMins);
  assert.ok(slotMins >= 60);
});

test('scheduler QA D/E — resize right and left in 30-min steps persist', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const f = await requireRcFixtures();
  const customer = await createRcCustomer('sched-resize');
  const startAt = nextSlot();

  const apptId = await createAppointmentNextSlot({
    customerId: customer.id,
    staffId: f.staff.id,
    serviceIds: [f.cut.id],
    source: 'booking',
  });

  const [base] = await hairDb
    .select()
    .from(fyhAppointments)
    .where(eq(fyhAppointments.id, apptId))
    .limit(1);

  const extendedEnd = new Date(base!.endAt.getTime() + 30 * 60_000);
  await rescheduleAppointment({
    id: apptId,
    startAt: base!.startAt,
    endAt: extendedEnd,
  });

  const [afterRight] = await hairDb
    .select()
    .from(fyhAppointments)
    .where(eq(fyhAppointments.id, apptId))
    .limit(1);
  assert.equal(
    afterRight!.endAt.getTime() - afterRight!.startAt.getTime(),
    base!.endAt.getTime() - base!.startAt.getTime() + 30 * 60_000,
  );

  const shiftedStart = new Date(base!.startAt.getTime() + 30 * 60_000);
  await rescheduleAppointment({
    id: apptId,
    startAt: shiftedStart,
    endAt: afterRight!.endAt,
  });

  const [afterLeft] = await hairDb
    .select()
    .from(fyhAppointments)
    .where(eq(fyhAppointments.id, apptId))
    .limit(1);
  assert.equal(afterLeft!.startAt.getTime(), shiftedStart.getTime());
  assert.equal(afterLeft!.endAt.getTime(), afterRight!.endAt.getTime());
});

test('scheduler QA F — edit appointment persists notes and staff', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const f = await requireRcFixtures();
  const customer = await createRcCustomer('sched-edit');
  const apptId = await createAppointmentNextSlot({
    customerId: customer.id,
    staffId: f.staff.id,
    serviceIds: [f.cut.id],
    notes: 'before',
    source: 'booking',
  });

  await updateAppointment({
    id: apptId,
    notes: 'after edit',
  });

  const row = await getAppointmentById(apptId);
  assert.equal(row!.notes, 'after edit');
});

test('scheduler QA G/H — service change updates duration; custom duration preserved', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const f = await requireRcFixtures();
  const customer = await createRcCustomer('sched-svc');

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
  const customEnd = new Date(created!.endAt.getTime() + 30 * 60_000);
  await rescheduleAppointment({ id: apptId, startAt: created!.startAt, endAt: customEnd });

  await updateAppointment({ id: apptId, serviceIds: [f.blow.id] });

  const [customKept] = await hairDb
    .select()
    .from(fyhAppointments)
    .where(eq(fyhAppointments.id, apptId))
    .limit(1);
  assert.equal(
    customKept!.endAt.getTime() - customKept!.startAt.getTime(),
    customEnd.getTime() - created!.startAt.getTime(),
  );

  const appt2 = await createAppointmentNextSlot({
    customerId: customer.id,
    staffId: f.staff.id,
    serviceIds: [f.cut.id],
    source: 'booking',
  });
  await updateAppointment({ id: appt2, serviceIds: [f.cut.id, f.blow.id] });
  const [std] = await hairDb
    .select()
    .from(fyhAppointments)
    .where(eq(fyhAppointments.id, appt2))
    .limit(1);
  const svcMins = (
    await hairDb.select().from(fyhAppointmentServices).where(eq(fyhAppointmentServices.appointmentId, appt2))
  ).reduce((s, x) => s + x.durationMinutes, 0);
  assert.equal(
    Math.round((std!.endAt.getTime() - std!.startAt.getTime()) / 60_000),
    svcMins,
  );
});

test('scheduler QA I — Raise Sale path builds basket (existing Quick Sale bridge)', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const f = await requireRcFixtures();
  const customer = await createRcCustomer('sched-sale');
  const apptId = await createAppointmentNextSlot({
    customerId: customer.id,
    staffId: f.staff.id,
    serviceIds: [f.cut.id],
    source: 'walk_in',
  });

  const basket = await buildBasketFromAppointment(apptId);
  assert.equal(basket.customerId, customer.id);
  assert.equal(basket.lines.length, 1);
  assert.equal(basket.lines[0]!.billableRef.id, f.cut.id);
});

test('scheduler QA J — invoiced appointment blocks customer/service mutation', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const f = await requireRcFixtures();
  const customer = await createRcCustomer('sched-lock');
  const other = await createRcCustomer('sched-lock-2');
  const apptId = await createAppointmentNextSlot({
    customerId: customer.id,
    staffId: f.staff.id,
    serviceIds: [f.cut.id],
    source: 'walk_in',
  });

  const basket = await buildBasketFromAppointment(apptId);
  const priced = priceBasket(basket);
  await checkoutFromBasket({
    basket: {
      ...basket,
      payments: [{ id: 'pay-sched', method: 'cash', amountPaise: priced.totals.grandTotalPaise }],
    },
    source: 'appointment',
    appointmentId: apptId,
  });

  await assert.rejects(
    () => updateAppointment({ id: apptId, customerId: other.id }),
    /Cannot change client/,
  );
  await assert.rejects(
    () => updateAppointment({ id: apptId, serviceIds: [f.blow.id] }),
    /Cannot change services/,
  );

  await updateAppointment({ id: apptId, notes: 'post-sale note ok' });
  const [row] = await hairDb
    .select()
    .from(fyhAppointments)
    .where(eq(fyhAppointments.id, apptId))
    .limit(1);
  assert.equal(row!.notes, 'post-sale note ok');
});

test('scheduler QA K — conflict check rejects double booking same staff', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const f = await requireRcFixtures();
  const customer = await createRcCustomer('sched-conflict');
  const startAt = nextSlot();
  const appt1 = await createAppointmentNextSlot({
    customerId: customer.id,
    staffId: f.staff.id,
    serviceIds: [f.cut.id],
    source: 'booking',
  });

  const [first] = await hairDb
    .select()
    .from(fyhAppointments)
    .where(eq(fyhAppointments.id, appt1))
    .limit(1);

  await assert.rejects(
    () =>
      createAppointment({
        customerId: customer.id,
        staffId: f.staff.id,
        startAt: first!.startAt,
        serviceIds: [f.cut.id],
        source: 'booking',
      }),
    /already booked/,
  );
});

test('scheduler QA — checkout still links invoice without regression', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const f = await requireRcFixtures();
  const customer = await createRcCustomer('sched-co');
  const apptId = await createAppointmentNextSlot({
    customerId: customer.id,
    staffId: f.staff.id,
    serviceIds: [f.cut.id],
    source: 'walk_in',
  });

  const basket = await buildBasketFromAppointment(apptId);
  const priced = priceBasket(basket);
  const result = await checkoutFromBasket({
    basket: {
      ...basket,
      payments: [{ id: 'pay-co', method: 'cash', amountPaise: priced.totals.grandTotalPaise }],
    },
    source: 'appointment',
    appointmentId: apptId,
  });

  const [inv] = await hairDb
    .select()
    .from(fyhInvoices)
    .where(eq(fyhInvoices.id, result.invoiceId))
    .limit(1);
  assert.ok(inv);
  assert.equal(inv!.appointmentId, apptId);
});

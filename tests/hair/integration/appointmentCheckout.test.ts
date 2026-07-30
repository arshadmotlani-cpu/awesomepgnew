import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhAppointments,
  fyhFinancialLedger,
  fyhInvoiceLineAttributions,
  fyhInvoiceLines,
  fyhInvoices,
} from '@/src/hair/db/schema';
import { buildBasketFromAppointment } from '@/src/hair/domain/basket/appointmentBridge';
import { checkoutFromBasket } from '@/src/hair/domain/checkout/pipeline';
import { priceBasket } from '@/src/hair/domain/basket/engine';
import {
  createAppointment,
  updateAppointmentStatus,
} from '@/src/hair/services/appointments';
import { createRcCustomer, nextSlot, requireRcFixtures } from './rcFixtures.ts';
import { migrationSkipMessage, probeHairQuickSaleMigrations } from './migrationGuard.ts';

// Shared RC DB may retain stylist bookings at low monotonic slot indices from prior runs.
for (let i = 0; i < 500; i++) nextSlot();

test('appointment checkout via basket posts ledger and links invoice', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const f = await requireRcFixtures();
  const customer = await createRcCustomer('appt-co');

  const apptId = await createAppointment({
    customerId: customer.id,
    staffId: f.staff.id,
    resourceId: f.chair.id,
    startAt: nextSlot(),
    serviceIds: [f.cut.id],
    source: 'walk_in',
  });
  await updateAppointmentStatus(apptId, 'in_service');

  const basket = await buildBasketFromAppointment(apptId);
  assert.equal(basket.customerId, customer.id);
  assert.equal(basket.lines.length, 1);
  assert.equal(basket.lines[0]!.billableRef.id, f.cut.id);
  assert.equal(basket.lines[0]!.staff[0]?.staffId, f.staff.id);
  assert.equal(basket.lines[0]!.staff[0]?.shareBps, 10_000);

  const priced = priceBasket(basket);
  const result = await checkoutFromBasket({
    basket: {
      ...basket,
      payments: [{ id: 'pay-0', method: 'cash', amountPaise: priced.totals.grandTotalPaise }],
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
  assert.equal(inv!.source, 'appointment');
  assert.equal(inv!.appointmentId, apptId);
  assert.equal(inv!.status, 'paid');
  assert.equal(result.amountPaidPaise, priced.totals.grandTotalPaise);

  const [appt] = await hairDb
    .select()
    .from(fyhAppointments)
    .where(eq(fyhAppointments.id, apptId))
    .limit(1);
  assert.equal(appt!.invoiceId, result.invoiceId);
  assert.equal(appt!.status, 'paid');

  const ledger = await hairDb
    .select()
    .from(fyhFinancialLedger)
    .where(eq(fyhFinancialLedger.invoiceId, result.invoiceId));
  assert.ok(ledger.some((e) => e.kind === 'payment_received'));
  assert.ok(ledger.some((e) => e.kind === 'invoice_charge'));

  const invLines = await hairDb
    .select({ id: fyhInvoiceLines.id })
    .from(fyhInvoiceLines)
    .where(eq(fyhInvoiceLines.invoiceId, result.invoiceId));
  const lineIds = invLines.map((l) => l.id);
  const attrs = await hairDb.select().from(fyhInvoiceLineAttributions);
  assert.ok(
    attrs.some(
      (a) => lineIds.includes(a.invoiceLineId) && a.staffId === f.staff.id && a.shareBps === 10_000,
    ),
  );
});

test('appointment checkout unpaid marks completed and opens receivable', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const f = await requireRcFixtures();
  const customer = await createRcCustomer('appt-due');

  const apptId = await createAppointment({
    customerId: customer.id,
    staffId: f.staff.id,
    resourceId: f.chair.id,
    startAt: nextSlot(),
    serviceIds: [f.cut.id],
    source: 'booking',
  });
  await updateAppointmentStatus(apptId, 'arrived');

  const basket = await buildBasketFromAppointment(apptId);
  const result = await checkoutFromBasket({
    basket: { ...basket, flags: { markFullDue: true } },
    source: 'appointment',
    appointmentId: apptId,
    allowUnpaid: true,
  });

  const [inv] = await hairDb
    .select()
    .from(fyhInvoices)
    .where(eq(fyhInvoices.id, result.invoiceId))
    .limit(1);
  assert.equal(inv!.status, 'unpaid');
  assert.equal(inv!.source, 'appointment');

  const [appt] = await hairDb
    .select()
    .from(fyhAppointments)
    .where(eq(fyhAppointments.id, apptId))
    .limit(1);
  assert.equal(appt!.status, 'completed');
  assert.equal(appt!.invoiceId, result.invoiceId);

  const ledger = await hairDb
    .select()
    .from(fyhFinancialLedger)
    .where(eq(fyhFinancialLedger.invoiceId, result.invoiceId));
  assert.ok(ledger.some((e) => e.kind === 'receivable_open'));
});

test('buildBasketFromAppointment rejects booked status', async (t) => {
  const probe = await probeHairQuickSaleMigrations();
  if (!probe.ok) t.skip(migrationSkipMessage(probe));

  const f = await requireRcFixtures();
  const customer = await createRcCustomer('appt-bad');

  const apptId = await createAppointment({
    customerId: customer.id,
    staffId: f.staff.id,
    resourceId: f.chair.id,
    startAt: nextSlot(),
    serviceIds: [f.cut.id],
  });

  await assert.rejects(() => buildBasketFromAppointment(apptId), /Cannot checkout/i);
});

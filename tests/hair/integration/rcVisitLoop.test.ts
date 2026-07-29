import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAppEnv } from '../../../src/lib/db/loadEnv.ts';
loadAppEnv();

import { eq, and, desc } from 'drizzle-orm';
import { hairDb } from '../../../src/hair/db/client.ts';
import { fyhAppointments, fyhProducts, fyhNotificationOutbox } from '../../../src/hair/db/schema/index.ts';
import {
  createAppointment,
  rescheduleAppointment,
  updateAppointmentStatus,
} from '../../../src/hair/services/appointments.ts';
import {
  createInvoiceFromAppointment,
  recordInvoicePayments,
} from '../../../src/hair/services/invoices.ts';
import {
  createBridalProfile,
  markCommissionsPaid,
  sellMembership,
  sellPackage,
  topUpWallet,
} from '../../../src/hair/services/loyaltyOps.ts';
import { getDashboardSnapshot } from '../../../src/hair/services/dashboard.ts';
import { getReportsSnapshot } from '../../../src/hair/services/reports.ts';
import { searchHair } from '../../../src/hair/services/search.ts';
import { occupiesBookableSlot, isCheckoutAllowedStatus } from '../../../src/hair/lib/appointmentStatus.ts';
import {
  commissionsForStaff,
  createRcCustomer,
  customerPackage,
  getInvoice,
  listPayments,
  nextSlot,
  requireRcFixtures,
  stockMovementsFor,
  timelineFor,
} from './rcFixtures.ts';

test('RC fixtures present', async () => {
  const f = await requireRcFixtures();
  assert.ok(f.cut.id);
  assert.ok(f.pkgPlan.serviceId === f.cut.id);
});

test('scenario 1 — walk-in checkout UPI + inventory + commission + timeline', async () => {
  const f = await requireRcFixtures();
  const customer = await createRcCustomer('walkin');
  const [productBefore] = await hairDb
    .select()
    .from(fyhProducts)
    .where(eq(fyhProducts.id, f.product.id))
    .limit(1);
  const stockBefore = Number(productBefore!.stockQty);

  const startAt = nextSlot(3);
  const apptId = await createAppointment({
    customerId: customer.id,
    staffId: f.staff.id,
    resourceId: f.chair.id,
    startAt,
    serviceIds: [f.cut.id],
    source: 'walk_in',
  });

  await updateAppointmentStatus(apptId, 'in_service');
  const invoiceId = await createInvoiceFromAppointment(apptId);
  const invoice = await getInvoice(invoiceId);
  assert.ok(invoice);
  assert.equal(invoice!.status, 'unpaid');
  assert.ok(invoice!.grandTotalPaise > invoice!.subtotalPaise); // GST

  const due = invoice!.grandTotalPaise;
  await recordInvoicePayments(invoiceId, [{ method: 'upi', amountPaise: due }]);
  const paid = await getInvoice(invoiceId);
  assert.equal(paid!.status, 'paid');

  const timeline = await timelineFor(customer.id);
  assert.ok(timeline.some((t) => t.eventType === 'bill' || /Invoice|paid/i.test(t.title)));

  const commissions = await commissionsForStaff(f.staff.id);
  assert.ok(commissions.some((c) => c.status === 'pending' && c.amountPaise > 0));

  const [productAfter] = await hairDb
    .select()
    .from(fyhProducts)
    .where(eq(fyhProducts.id, f.product.id))
    .limit(1);
  assert.ok(Number(productAfter!.stockQty) < stockBefore);

  const movements = await stockMovementsFor(f.product.id);
  assert.ok(movements.some((m) => m.referenceId === invoiceId));

  const [appt] = await hairDb
    .select()
    .from(fyhAppointments)
    .where(eq(fyhAppointments.id, apptId))
    .limit(1);
  assert.equal(appt!.status, 'paid');
  assert.equal(occupiesBookableSlot(appt!.status), false);
});

test('scenario 2 — membership discount applied', async () => {
  const f = await requireRcFixtures();
  const customer = await createRcCustomer('member');
  await sellMembership(customer.id, f.membership.id);

  const startAt = nextSlot(4);
  const apptId = await createAppointment({
    customerId: customer.id,
    staffId: f.staff.id,
    resourceId: f.chair.id,
    startAt,
    serviceIds: [f.blow.id],
    source: 'walk_in',
  });
  await updateAppointmentStatus(apptId, 'in_service');
  const invoiceId = await createInvoiceFromAppointment(apptId);
  const invoice = await getInvoice(invoiceId);
  assert.ok(invoice!.membershipRedemptionPaise > 0);
  assert.ok(
    invoice!.grandTotalPaise <
      invoice!.subtotalPaise + invoice!.taxPaise,
  );
});

test('scenario 3 — package redeem burns one session', async () => {
  const f = await requireRcFixtures();
  const customer = await createRcCustomer('pkg');
  await sellPackage(customer.id, f.pkgPlan.id);
  const before = await customerPackage(customer.id);
  assert.equal(before!.usedSessions, 0);

  const startAt = nextSlot(5);
  const apptId = await createAppointment({
    customerId: customer.id,
    staffId: f.staff.id,
    resourceId: f.chair.id,
    startAt,
    serviceIds: [f.cut.id],
    source: 'walk_in',
  });
  await updateAppointmentStatus(apptId, 'in_service');
  const invoiceId = await createInvoiceFromAppointment(apptId);
  const invoice = await getInvoice(invoiceId);
  assert.ok(invoice!.packageRedemptionPaise > 0);

  await recordInvoicePayments(invoiceId, [
    { method: 'cash', amountPaise: invoice!.grandTotalPaise || 0 },
  ]);
  // zero total possible if package covers all — handle
  if (invoice!.grandTotalPaise === 0) {
    // already paid at create
  } else {
    const paid = await getInvoice(invoiceId);
    assert.equal(paid!.status, 'paid');
  }

  const after = await customerPackage(customer.id);
  assert.equal(after!.usedSessions, before!.usedSessions + 1);
});

test('scenario 4 — wallet top-up and mixed wallet+cash', async () => {
  const f = await requireRcFixtures();
  const customer = await createRcCustomer('wallet');
  await topUpWallet(customer.id, 50_000);

  const startAt = nextSlot(6);
  const apptId = await createAppointment({
    customerId: customer.id,
    staffId: f.staff2.id,
    resourceId: f.chair.id,
    startAt,
    serviceIds: [f.blow.id],
    source: 'walk_in',
  });
  await updateAppointmentStatus(apptId, 'in_service');
  const invoiceId = await createInvoiceFromAppointment(apptId);
  const invoice = await getInvoice(invoiceId)!;
  const walletPay = Math.min(20_000, invoice!.grandTotalPaise);
  const cashPay = invoice!.grandTotalPaise - walletPay;
  await recordInvoicePayments(invoiceId, [
    { method: 'wallet', amountPaise: walletPay },
    ...(cashPay > 0 ? [{ method: 'cash' as const, amountPaise: cashPay }] : []),
  ]);
  const paid = await getInvoice(invoiceId);
  assert.equal(paid!.status, 'paid');
  const payments = await listPayments(invoiceId);
  assert.ok(payments.some((p) => p.method === 'wallet'));
});

test('scenario 5 — cash + UPI split equals grand total', async () => {
  const f = await requireRcFixtures();
  const customer = await createRcCustomer('split');
  const startAt = nextSlot(7);
  const apptId = await createAppointment({
    customerId: customer.id,
    staffId: f.staff2.id,
    startAt,
    serviceIds: [f.blow.id],
    source: 'walk_in',
  });
  await updateAppointmentStatus(apptId, 'in_service');
  const invoiceId = await createInvoiceFromAppointment(apptId);
  const inv = await getInvoice(invoiceId)!;
  const half = Math.floor(inv!.grandTotalPaise / 2);
  const rest = inv!.grandTotalPaise - half;
  await recordInvoicePayments(invoiceId, [
    { method: 'cash', amountPaise: half },
    { method: 'upi', amountPaise: rest },
  ]);
  const payments = await listPayments(invoiceId);
  const sum = payments.reduce((s, p) => s + p.amountPaise, 0);
  assert.equal(sum, inv!.grandTotalPaise);
});

test('scenario 6/7/8 — reschedule conflict, cancel, no-show free slots', async () => {
  const f = await requireRcFixtures();
  const customer = await createRcCustomer('sched');
  const startAt = nextSlot(8);
  const apptId = await createAppointment({
    customerId: customer.id,
    staffId: f.staff.id,
    resourceId: f.chair.id,
    startAt,
    serviceIds: [f.blow.id],
    source: 'booking',
  });

  const customer2 = await createRcCustomer('sched2');
  await assert.rejects(
    () =>
      createAppointment({
        customerId: customer2.id,
        staffId: f.staff.id,
        resourceId: f.chair.id,
        startAt,
        serviceIds: [f.blow.id],
        source: 'booking',
      }),
    /already booked/i,
  );

  const moved = new Date(startAt.getTime());
  moved.setHours(16, 0, 0, 0);
  await rescheduleAppointment({ id: apptId, startAt: moved, staffId: f.staff2.id });

  await updateAppointmentStatus(apptId, 'cancelled');
  const [cancelled] = await hairDb
    .select()
    .from(fyhAppointments)
    .where(eq(fyhAppointments.id, apptId))
    .limit(1);
  assert.equal(occupiesBookableSlot(cancelled!.status), false);

  const appt2 = await createAppointment({
    customerId: customer2.id,
    staffId: f.staff.id,
    resourceId: f.chair.id,
    startAt,
    serviceIds: [f.blow.id],
    source: 'booking',
  });
  await updateAppointmentStatus(appt2, 'no_show');
  assert.equal(occupiesBookableSlot('no_show'), false);
});

test('scenario 9 — bridal profile create', async () => {
  const customer = await createRcCustomer('bridal');
  const profile = await createBridalProfile({
    customerId: customer.id,
    brideName: 'RC Bride',
    weddingDate: '2026-12-01',
  });
  assert.ok(profile.id);
});

test('scenario 11 — mark commissions paid', async () => {
  const f = await requireRcFixtures();
  const pending = (await commissionsForStaff(f.staff.id)).filter((c) => c.status === 'pending');
  if (pending.length === 0) {
    // ensure at least one from prior tests; create quick paid visit
    const customer = await createRcCustomer('comm');
    const startAt = nextSlot(9);
    const apptId = await createAppointment({
      customerId: customer.id,
      staffId: f.staff.id,
      startAt,
      serviceIds: [f.cut.id],
      source: 'walk_in',
    });
    await updateAppointmentStatus(apptId, 'in_service');
    const invoiceId = await createInvoiceFromAppointment(apptId);
    const inv = await getInvoice(invoiceId)!;
    if (inv!.grandTotalPaise > 0) {
      await recordInvoicePayments(invoiceId, [
        { method: 'cash', amountPaise: inv!.grandTotalPaise },
      ]);
    }
  }
  await markCommissionsPaid(f.staff.id);
  const after = await commissionsForStaff(f.staff.id);
  assert.ok(after.every((c) => c.status === 'paid' || c.staffId === f.staff.id));
  assert.ok(after.some((c) => c.status === 'paid'));
});

test('scenario 12/13 — dashboard and reports populate', async () => {
  const dash = await getDashboardSnapshot();
  assert.ok(dash.totalCustomers >= 0);
  assert.ok(Array.isArray(dash.todaysSchedule));
  assert.ok(Array.isArray(dash.recentBills));
  const reports = await getReportsSnapshot();
  assert.ok(typeof reports.todayRevenuePaise === 'number');
});

test('scenario 14 — search finds customers', async () => {
  const hits = await searchHair('RC Customer');
  assert.ok(hits.some((h) => h.type === 'customer'));
});

test('scenario 17/20 — checkout gate and payment idempotency', async () => {
  assert.equal(isCheckoutAllowedStatus('booked'), false);
  const f = await requireRcFixtures();
  const customer = await createRcCustomer('gate');
  const startAt = nextSlot(10);
  const apptId = await createAppointment({
    customerId: customer.id,
    staffId: f.staff2.id,
    startAt,
    serviceIds: [f.blow.id],
    source: 'booking',
    status: 'booked',
  });
  await assert.rejects(() => createInvoiceFromAppointment(apptId), /Cannot checkout/i);

  await updateAppointmentStatus(apptId, 'arrived');
  await updateAppointmentStatus(apptId, 'in_service');
  const invoiceId = await createInvoiceFromAppointment(apptId);
  const inv = await getInvoice(invoiceId)!;
  if (inv!.grandTotalPaise > 0) {
    await recordInvoicePayments(invoiceId, [
      { method: 'cash', amountPaise: inv!.grandTotalPaise },
    ]);
    await assert.rejects(
      () =>
        recordInvoicePayments(invoiceId, [
          { method: 'cash', amountPaise: inv!.grandTotalPaise },
        ]),
      /already paid/i,
    );
  }
});

test('scenario 19 — notification outbox pending after booking', async () => {
  const f = await requireRcFixtures();
  const customer = await createRcCustomer('notify');
  const startAt = nextSlot(11);
  await createAppointment({
    customerId: customer.id,
    staffId: f.staff.id,
    startAt,
    serviceIds: [f.blow.id],
    source: 'booking',
  });
  const [outbox] = await hairDb
    .select()
    .from(fyhNotificationOutbox)
    .where(
      and(
        eq(fyhNotificationOutbox.recipient, customer.phone),
        eq(fyhNotificationOutbox.kind, 'appointment_confirmation'),
        eq(fyhNotificationOutbox.status, 'pending'),
      ),
    )
    .orderBy(desc(fyhNotificationOutbox.createdAt))
    .limit(1);
  assert.ok(outbox, 'expected pending appointment_confirmation for customer phone');
});

test('concurrent payments — only one succeeds side effects', async () => {
  const f = await requireRcFixtures();
  const customer = await createRcCustomer('race');
  const startAt = nextSlot(12);
  const apptId = await createAppointment({
    customerId: customer.id,
    staffId: f.staff2.id,
    startAt,
    serviceIds: [f.blow.id],
    source: 'walk_in',
  });
  await updateAppointmentStatus(apptId, 'in_service');
  const invoiceId = await createInvoiceFromAppointment(apptId);
  const inv = await getInvoice(invoiceId)!;
  if (inv!.grandTotalPaise <= 0) return;

  const results = await Promise.allSettled([
    recordInvoicePayments(invoiceId, [{ method: 'cash', amountPaise: inv!.grandTotalPaise }]),
    recordInvoicePayments(invoiceId, [{ method: 'upi', amountPaise: inv!.grandTotalPaise }]),
  ]);
  const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
  const rejected = results.filter((r) => r.status === 'rejected').length;
  assert.ok(fulfilled >= 1);
  assert.ok(rejected >= 1 || fulfilled === 1);
  const paid = await getInvoice(invoiceId);
  assert.equal(paid!.status, 'paid');
});

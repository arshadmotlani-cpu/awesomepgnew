/* eslint-disable no-console */
/**
 * Investigate why electricity invoices are excluded from Electricity Due queue.
 */
import { and, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { closeDb, createClient, db } from '../src/db/client';
import {
  bookings,
  customers,
  electricityBills,
  electricityInvoices,
  beds,
  rooms,
  pgs,
  floors,
} from '../src/db/schema';
import { listAdminElectricityInvoicesForReminders, listAdminOpenRentInvoices } from '../src/db/queries/admin';
import { buildCollectionsQueue } from '../src/lib/billing/collectionsQueue';
import { loadResidentOperationsDashboard } from '../src/services/residentOperationsDashboard';
import { loadUnifiedOperationsQueue } from '../src/services/unifiedOperationsQueue';
import { isElectricityAwaitingResidentPayment } from '../src/lib/billing/electricityCollectibility';
import { projectElectricityInvoice } from '../src/services/electricityBilling';
import { asElectricityInvoiceRow } from '../src/lib/db/electricityInvoiceSelect';
import { operationsElectricityInvoiceFilter } from '../src/lib/billing/electricityOperationsFilter';
import { todayString } from '../src/lib/dates';
import { adminUsers } from '../src/db/schema';
import type { AdminSession } from '../src/lib/auth/session';

const TARGET_NAMES = [
  'Manjusha Bhosale',
  'Disha Rangari',
  'Waqar Ahmad',
  'Angatra Mandal',
  'Rishik Khobragade',
];

async function getSession(): Promise<AdminSession> {
  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.role, 'super_admin')).limit(1);
  if (!admin) throw new Error('No super admin');
  return {
    adminId: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    role: admin.role,
    pgScope: admin.pgScope ?? [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 3600000),
  };
}

function explainExclusion(row: {
  id: string;
  status: string;
  paymentProofUrl: string | null;
  outstandingPaise: number;
  effectiveStatus: string;
  supersededByInvoiceId: string | null;
  bookingId: string;
  billingMonth: string;
  paidMonthBlocked: boolean;
  inOperationsJoin: boolean;
  isPipelineTest: boolean;
  bookingIsTest: boolean;
  customerIsTest: boolean;
  customerEmail: string;
}): string[] {
  const reasons: string[] = [];
  if (row.supersededByInvoiceId) reasons.push('superseded_by_invoice');
  if (row.status === 'paid') reasons.push('status=paid');
  if (row.status === 'cancelled') reasons.push('status=cancelled');
  if (row.status !== 'pending') reasons.push(`status=${row.status} (query requires pending)`);
  if (row.outstandingPaise <= 0) reasons.push(`outstanding_paise=${row.outstandingPaise}`);
  if (row.paymentProofUrl?.trim()) reasons.push('payment_proof_uploaded → waiting_for_approval');
  if (row.effectiveStatus === 'paid') reasons.push('effectiveStatus=paid');
  if (row.effectiveStatus === 'cancelled') reasons.push('effectiveStatus=cancelled');
  if (row.effectiveStatus === 'payment_in_progress') reasons.push('effectiveStatus=payment_in_progress');
  if (row.paidMonthBlocked) reasons.push('paid_booking_month_key blocks duplicate month');
  if (!row.inOperationsJoin) reasons.push('fails operationsElectricityInvoiceFilter join (test/pipeline)');
  if (row.isPipelineTest) reasons.push('is_pipeline_test=true');
  if (row.bookingIsTest) reasons.push('booking.is_test=true');
  if (row.customerIsTest) reasons.push('customer.is_test=true');
  if (reasons.length === 0) reasons.push('SHOULD_BE_IN_QUEUE');
  return reasons;
}

async function main() {
  createClient({ max: 3 });
  const session = await getSession();
  const today = todayString();

  const customersRows = await db
    .select({ id: customers.id, fullName: customers.fullName, email: customers.email })
    .from(customers)
    .where(
      or(
        ...TARGET_NAMES.map((n) => ilike(customers.fullName, n)),
      ),
    );

  const customerIds = customersRows.map((c) => c.id);
  console.log('\n=== Target customers ===');
  for (const c of customersRows) console.log(c.fullName, c.id);

  const allInvoices = await db
    .select({
      id: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      customerId: electricityInvoices.customerId,
      customerName: customers.fullName,
      status: electricityInvoices.status,
      amountPaise: electricityInvoices.amountPaise,
      paidPaise: electricityInvoices.paidPaise,
      lateFeeLockedPaise: electricityInvoices.lateFeeLockedPaise,
      paymentProofUrl: electricityInvoices.paymentProofUrl,
      billingMonth: electricityInvoices.billingMonth,
      dueDate: electricityInvoices.dueDate,
      bookingId: electricityInvoices.bookingId,
      supersededByInvoiceId: electricityInvoices.supersededByInvoiceId,
      isPipelineTest: electricityInvoices.isPipelineTest,
      bookingIsTest: bookings.isTest,
      customerIsTest: customers.isTest,
      customerEmail: customers.email,
    })
    .from(electricityInvoices)
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .leftJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
    .where(inArray(electricityInvoices.customerId, customerIds))
    .orderBy(customers.fullName, electricityInvoices.billingMonth);

  const paidMonths = await db
    .select({
      bookingId: electricityInvoices.bookingId,
      billingMonth: electricityInvoices.billingMonth,
    })
    .from(electricityInvoices)
    .where(and(eq(electricityInvoices.status, 'paid'), inArray(electricityInvoices.customerId, customerIds)));

  const paidMonthKeys = new Set(paidMonths.map((r) => `${r.bookingId}:${r.billingMonth}`));

  const reminderRes = await listAdminElectricityInvoicesForReminders();
  const reminderIds = new Set((reminderRes.ok ? reminderRes.data : []).map((r) => r.id));

  const openRent = await listAdminOpenRentInvoices();
  const rentDueCustomers = new Set(
    (openRent.ok ? openRent.data : [])
      .filter((r) => r.outstandingPaise > 0)
      .map((r) => r.customerId),
  );

  const dashboard = await loadResidentOperationsDashboard(session);
  const elecDueIds = new Set(
    dashboard.queue.filter((q) => q.category === 'electricity_due').map((q) => q.sourceId).filter(Boolean) as string[],
  );

  const unified = await loadUnifiedOperationsQueue(session, 'electricity_due');
  const unifiedIds = new Set(
    unified.items.map((i) => i.id.replace(/^elec-/, '')).filter(Boolean),
  );

  console.log('\n=== Per-invoice analysis ===');
  for (const inv of allInvoices) {
    const projected = projectElectricityInvoice(
      asElectricityInvoiceRow({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customerId,
        bookingId: inv.bookingId,
        bedId: '',
        electricityBillId: '',
        billingMonth: inv.billingMonth,
        dueDate: inv.dueDate,
        amountPaise: inv.amountPaise,
        paidPaise: inv.paidPaise,
        lateFeeLockedPaise: inv.lateFeeLockedPaise,
        status: inv.status,
        paymentProofUrl: inv.paymentProofUrl,
        supersededByInvoiceId: inv.supersededByInvoiceId,
        isPipelineTest: inv.isPipelineTest,
      }),
      today,
    );

    const inOpsJoin = await db
      .select({ id: electricityInvoices.id })
      .from(electricityInvoices)
      .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
      .innerJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
      .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
      .innerJoin(beds, eq(beds.id, electricityInvoices.bedId))
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .innerJoin(pgs, eq(pgs.id, electricityBills.pgId))
      .where(and(eq(electricityInvoices.id, inv.id), operationsElectricityInvoiceFilter()))
      .limit(1);

    const paidMonthBlocked = paidMonthKeys.has(`${inv.bookingId}:${inv.billingMonth}`);

    const reasons = explainExclusion({
      id: inv.id,
      status: inv.status,
      paymentProofUrl: inv.paymentProofUrl,
      outstandingPaise: projected.outstandingPaise,
      effectiveStatus: projected.effectiveStatus,
      supersededByInvoiceId: inv.supersededByInvoiceId,
      bookingId: inv.bookingId,
      billingMonth: inv.billingMonth,
      paidMonthBlocked,
      inOperationsJoin: inOpsJoin.length > 0,
      isPipelineTest: inv.isPipelineTest,
      bookingIsTest: inv.bookingIsTest ?? false,
      customerIsTest: inv.customerIsTest,
      customerEmail: inv.customerEmail,
    });

    const awaiting = isElectricityAwaitingResidentPayment(
      {
        id: inv.id,
        status: inv.status,
        paymentProofUrl: inv.paymentProofUrl,
        outstandingPaise: projected.outstandingPaise,
        effectiveStatus: projected.effectiveStatus,
        supersededByInvoiceId: inv.supersededByInvoiceId,
        bookingId: inv.bookingId,
        billingMonth: inv.billingMonth,
      },
      paidMonthKeys,
    );

    console.log('\n---');
    console.log('Resident:', inv.customerName);
    console.log('Invoice:', inv.invoiceNumber, inv.id);
    console.log('DB status:', inv.status, '| effective:', projected.effectiveStatus);
    console.log('Amount:', inv.amountPaise, '| paid:', inv.paidPaise, '| outstanding:', projected.outstandingPaise);
    console.log('Payment proof:', inv.paymentProofUrl ? 'YES' : 'no');
    console.log('In rent due cohort:', rentDueCustomers.has(inv.customerId) ? 'YES' : 'NO');
    console.log('awaitingResidentPayment:', awaiting);
    console.log('In listAdminElectricityInvoicesForReminders:', reminderIds.has(inv.id) ? 'YES' : 'NO');
    console.log('In dashboard electricity_due:', elecDueIds.has(inv.id) ? 'YES' : 'NO');
    console.log('In unified electricity_due:', unifiedIds.has(inv.id) ? 'YES' : 'NO');
    console.log('Exclusion reasons:', reasons.join(', '));
  }

  console.log('\n=== Queue counts ===');
  console.log('reminder list:', reminderRes.ok ? reminderRes.data.length : 'ERR');
  console.log('dashboard electricity_due:', dashboard.queue.filter((q) => q.category === 'electricity_due').length);
  console.log('unified electricity_due:', unified.items.length);

  console.log('\n=== VERIFICATION TABLE ===');
  console.log('Resident | Electricity invoice | Invoice status | Appears in Electricity Due');
  for (const inv of allInvoices) {
    const projected = projectElectricityInvoice(
      asElectricityInvoiceRow({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customerId,
        bookingId: inv.bookingId,
        bedId: '',
        electricityBillId: '',
        billingMonth: inv.billingMonth,
        dueDate: inv.dueDate,
        amountPaise: inv.amountPaise,
        paidPaise: inv.paidPaise,
        lateFeeLockedPaise: inv.lateFeeLockedPaise,
        status: inv.status,
        paymentProofUrl: inv.paymentProofUrl,
        supersededByInvoiceId: inv.supersededByInvoiceId,
        isPipelineTest: inv.isPipelineTest,
      }),
      today,
    );
    const inUnified = unified.items.some((i) => i.id === `elec-${inv.id}`);
    const shouldAppear = isElectricityAwaitingResidentPayment(
      {
        id: inv.id,
        status: inv.status,
        paymentProofUrl: inv.paymentProofUrl,
        outstandingPaise: projected.outstandingPaise,
        effectiveStatus: projected.effectiveStatus,
        supersededByInvoiceId: inv.supersededByInvoiceId,
        bookingId: inv.bookingId,
        billingMonth: inv.billingMonth,
      },
      paidMonthKeys,
    );
    const statusLabel = `${inv.status} (effective: ${projected.effectiveStatus}, outstanding: ₹${(projected.outstandingPaise / 100).toFixed(0)})`;
    const appears = inUnified ? 'YES' : 'NO';
    const match = shouldAppear === inUnified ? '✓' : '✗ MISMATCH';
    console.log(
      `${inv.customerName} | ${inv.invoiceNumber} | ${statusLabel} | ${appears} ${match}`,
    );
  }

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

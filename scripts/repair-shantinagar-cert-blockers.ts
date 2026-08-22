/* eslint-disable no-console */
/**
 * One-time Shantinagar Phase 1 cert blocker repairs (4 residents only).
 *
 *   npx tsx scripts/repair-shantinagar-cert-blockers.ts           # dry-run
 *   npx tsx scripts/repair-shantinagar-cert-blockers.ts --execute
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.prod.live' });
dotenv.config({ path: '.env.production.local' });

import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { adminUsers, auditLog, bookings, financialInvoices, rentInvoices } from '@/src/db/schema';
import { getBookingFinancialAccount } from '@/src/services/residentFinancialEngine';
import { projectInvoice } from '@/src/services/rentInvoices';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
import { computeElectricityLateFee } from '@/src/services/billing';
import { formatDate } from '@/src/lib/dates';
import {
  buildPaidElectricityBookingMonthKeys,
  isElectricityAwaitingResidentPayment,
} from '@/src/lib/billing/electricityCollectibility';
import { listElectricityInvoicesForBooking, listRentInvoicesForBooking } from '@/src/db/queries/customer';
import { cancelUnifiedInvoice, syncElectricityInvoiceToUnified } from '@/src/services/unifiedInvoices';
import { electricityInvoices } from '@/src/db/schema';

const execute = process.argv.includes('--execute');

const DHRUV_BOOKING_ID = '70debd82-4c80-4fd7-a368-0cd7c40f7fbd';
const DHRUV_ELEC_INVOICE_ID = '6d8d46c3-115d-4a12-a4c3-808774e60473';

const SYED_BOOKING_ID = '1ed707bc-14d7-4e52-844d-40f309385506';
const SYED_DUPLICATE_RENT_INVOICE_ID = '24f3b829-1a63-43d9-ab5b-8f25e77f9843';
const SYED_DUPLICATE_INVOICE_NUMBER = 'RNT-2026-08-0019';

async function findAdmin(): Promise<{ id: string; email: string }> {
  const fromEnv = process.env.REPAIR_ADMIN_ID?.trim();
  if (fromEnv) {
    const [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, fromEnv)).limit(1);
    if (row) return { id: row.id, email: row.email };
  }
  const [row] = await db
    .select()
    .from(adminUsers)
    .where(and(eq(adminUsers.role, 'super_admin'), eq(adminUsers.isActive, true)))
    .limit(1);
  if (!row) throw new Error('No super_admin found. Set REPAIR_ADMIN_ID.');
  return { id: row.id, email: row.email };
}

async function snapshotBalances(bookingId: string, bookingCode: string, customerId: string, customerName: string, customerPhone: string) {
  const acct = await getBookingFinancialAccount({
    bookingId,
    customerId,
    customerName,
    customerPhone,
    bookingCode,
    pgId: '64ead929-b7a0-43a6-8ac4-cafdd398ecde',
    pgName: 'Shantinagar',
    roomNumber: '?',
    depositPaise: 0,
    depositDuePaise: 0,
  });
  const rentList = await listRentInvoicesForBooking(bookingId);
  let invRentOut = 0;
  if (rentList.ok) {
    for (const row of rentList.data) {
      if (row.status === 'cancelled') continue;
      invRentOut += projectInvoice({
        ...row,
        cancelledAt: null,
        cancellationReason: null,
        customerId,
        bedId: '',
        pgId: '64ead929-b7a0-43a6-8ac4-cafdd398ecde',
        paymentId: row.paymentId ?? null,
        isAdhoc: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).outstandingPaise;
    }
  }
  const elecList = await listElectricityInvoicesForBooking(bookingId);
  const paidKeys = buildPaidElectricityBookingMonthKeys(
    (elecList.ok ? elecList.data : [])
      .filter((r) => r.status === 'paid')
      .map((r) => ({ bookingId, billingMonth: String(r.billingMonth) })),
  );
  let invElecOut = 0;
  if (elecList.ok) {
    for (const row of elecList.data) {
      if (row.status === 'cancelled') continue;
      const projected = projectElectricityInvoice({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        electricityBillId: row.electricityBillId,
        roomId: row.roomId,
        bookingId: row.bookingId,
        customerId,
        bedId: '',
        billingMonth: row.billingMonth,
        dueDate: row.dueDate,
        amountPaise: row.amountPaise,
        paidPaise: row.paidPaise,
        lateFeeLockedPaise: row.lateFeeLockedPaise,
        status: row.status,
        paymentId: row.paymentId ?? null,
        paidAt: row.paidAt,
        paymentProofUrl: row.paymentProofUrl,
        unitsShare: row.unitsShare,
        activeDays: row.activeDays,
        cancelledAt: null,
        supersededByInvoiceId: null,
        duplicateDetectedAt: null,
        isPipelineTest: false,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
      const out = Math.max(0, projected.outstandingPaise);
      if (
        isElectricityAwaitingResidentPayment(
          {
            id: row.id,
            status: row.status,
            paymentProofUrl: row.paymentProofUrl,
            outstandingPaise: out,
            effectiveStatus: projected.effectiveStatus,
            supersededByInvoiceId: null,
            bookingId,
            billingMonth: String(row.billingMonth),
          },
          paidKeys,
        )
      ) {
        invElecOut += out;
      }
    }
  }
  return {
    adminRent: acct.rent.outstandingPaise,
    adminElec: acct.electricity.outstandingPaise,
    invRentOut,
    invElecOut,
  };
}

async function finalizeDhruvElectricityPaid(adminId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const [invoice] = await db
    .select()
    .from(electricityInvoices)
    .where(eq(electricityInvoices.id, DHRUV_ELEC_INVOICE_ID))
    .limit(1);
  if (!invoice) return { ok: false, message: 'Invoice not found' };
  if (invoice.status === 'paid') return { ok: true };
  if (invoice.paidPaise < invoice.amountPaise) {
    return { ok: false, message: 'paid_paise below invoice amount' };
  }
  if (!invoice.paymentProofUrl?.trim()) {
    return { ok: false, message: 'missing payment proof' };
  }

  const paidAt = invoice.paidAt ?? new Date();
  const issueDate = formatDate(invoice.createdAt);
  const lockedLateFeePaise = computeElectricityLateFee({
    amountPaise: invoice.amountPaise,
    issueDate,
    today: formatDate(paidAt),
  });

  await db
    .update(electricityInvoices)
    .set({
      status: 'paid',
      paidAt,
      paidPaise: Math.max(invoice.paidPaise, invoice.amountPaise),
      lateFeeLockedPaise: lockedLateFeePaise,
      updatedAt: new Date(),
    })
    .where(eq(electricityInvoices.id, invoice.id));

  await syncElectricityInvoiceToUnified(invoice.id);
  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: adminId,
    entity: 'electricity_invoice',
    entityId: invoice.id,
    action: 'cert_repair_finalize_paid',
    diff: {
      invoiceNumber: invoice.invoiceNumber,
      reason: 'paid_paise matched amount with proof; status was stuck pending',
    },
  });
  return { ok: true };
}

async function main() {
  const admin = await findAdmin();

  const [dhruvBk] = await db.select().from(bookings).where(eq(bookings.id, DHRUV_BOOKING_ID)).limit(1);
  const [syedBk] = await db.select().from(bookings).where(eq(bookings.id, SYED_BOOKING_ID)).limit(1);
  const [dhruvElec] = await db
    .select()
    .from(electricityInvoices)
    .where(eq(electricityInvoices.id, DHRUV_ELEC_INVOICE_ID))
    .limit(1);
  const [syedDup] = await db
    .select()
    .from(rentInvoices)
    .where(eq(rentInvoices.id, SYED_DUPLICATE_RENT_INVOICE_ID))
    .limit(1);

  if (!dhruvBk || !syedBk || !dhruvElec || !syedDup) {
    throw new Error('Required booking/invoice rows missing.');
  }

  const dhruvBefore = await snapshotBalances(
    DHRUV_BOOKING_ID,
    dhruvBk.bookingCode,
    dhruvBk.customerId,
    'Dhruv',
    '',
  );
  const syedBefore = await snapshotBalances(
    SYED_BOOKING_ID,
    syedBk.bookingCode,
    syedBk.customerId,
    'Syed Ahmed',
    '',
  );

  console.log('\n=== Shantinagar cert blocker repair (dry-run:', !execute, ') ===\n');

  console.log('1. Dhruv — approve pending electricity proof (ELE-2026-07-0008)');
  console.log('   Cause: invoice paid_paise=₹670.16 but status still pending with proof; late fee ₹67 accrued.');
  console.log('   Before admin/invoice elec out:', dhruvBefore.adminElec, '/', dhruvBefore.invElecOut);

  console.log('\n2. Syed Ahmed — cancel duplicate transition invoice', SYED_DUPLICATE_INVOICE_NUMBER);
  console.log('   Cause: adhoc Jul-29→31 transition invoice duplicated under Aug billing month.');
  console.log('   Invoice rent ₹', syedDup.rentPaise / 100, 'status', syedDup.status);
  console.log('   Before admin/invoice rent out:', syedBefore.adminRent, '/', syedBefore.invRentOut);

  console.log('\n3. Vivek / Reetik — no production change (partial-month invoices already match SSOT).');
  console.log('   Cert billing-month compare fixed in shantinagarPhase1PortalCertification.ts');

  if (!execute) {
    console.log('\nDry run — pass --execute to apply Dhruv elec approval + Syed duplicate cancel.');
    return;
  }

  const elecApprove = await finalizeDhruvElectricityPaid(admin.id);
  if (!elecApprove.ok) throw new Error(`Dhruv elec finalize failed: ${elecApprove.message}`);

  const [syedUnified] = await db
    .select({ id: financialInvoices.id })
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.sourceTable, 'rent_invoices'),
        eq(financialInvoices.sourceId, SYED_DUPLICATE_RENT_INVOICE_ID),
      ),
    )
    .limit(1);

  const cancelReason =
    'Cert repair: cancel duplicate billing-cycle transition invoice (Jul 29–31 proration already covered by July rent).';
  if (syedUnified) {
    const cancel = await cancelUnifiedInvoice(syedUnified.id, cancelReason, { type: 'admin', id: admin.id });
    if (!cancel.ok) throw new Error(`Syed duplicate cancel failed: ${cancel.error}`);
  } else {
    const [updated] = await db
      .update(rentInvoices)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: cancelReason,
        updatedAt: new Date(),
      })
      .where(eq(rentInvoices.id, SYED_DUPLICATE_RENT_INVOICE_ID))
      .returning();
    if (!updated) throw new Error('Syed duplicate rent cancel update failed.');
  }

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: admin.id,
    entity: 'repair_script',
    entityId: SYED_DUPLICATE_RENT_INVOICE_ID,
    action: 'shantinagar_cert_blocker_repair',
    diff: {
      dhruvElecInvoiceId: DHRUV_ELEC_INVOICE_ID,
      syedCancelledInvoice: SYED_DUPLICATE_INVOICE_NUMBER,
    },
  });

  const dhruvAfter = await snapshotBalances(
    DHRUV_BOOKING_ID,
    dhruvBk.bookingCode,
    dhruvBk.customerId,
    'Dhruv',
    '',
  );
  const syedAfter = await snapshotBalances(
    SYED_BOOKING_ID,
    syedBk.bookingCode,
    syedBk.customerId,
    'Syed Ahmed',
    '',
  );

  console.log('\n=== After repair ===');
  console.log('Dhruv elec admin/invoice:', dhruvAfter.adminElec, '/', dhruvAfter.invElecOut);
  console.log('Syed rent admin/invoice:', syedAfter.adminRent, '/', syedAfter.invRentOut);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closeDb());

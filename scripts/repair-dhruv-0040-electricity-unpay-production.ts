#!/usr/bin/env npx tsx
/**
 * Production repair — reverse incorrect Dhruv July electricity payment.
 *
 * Root cause: repair-dhruv-0040-credit-correction.ts called applyElectricityAllocationForBooking
 * using the Aug 1 bulk payment proof — Dhruv never paid electricity separately.
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/repair-dhruv-0040-electricity-unpay-production.ts
 *   USE_PRODUCTION_DB=1 npx tsx scripts/repair-dhruv-0040-electricity-unpay-production.ts --execute
 */
import { and, eq } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('repair-dhruv-0040-electricity-unpay');

import { closeDb, db } from '@/src/db/client';
import { sql } from 'drizzle-orm';
import {
  adminUsers,
  auditLog,
  electricityInvoices,
  paymentApprovalAllocations,
  pgPaymentRecords,
} from '@/src/db/schema';
import { paiseToInr } from '@/src/lib/format';
import { buildResidentBillRowsFromDetail } from '@/src/lib/residents/residentPortalBillRows';
import { buildResidentElectricityAccount } from '@/src/lib/residents/residentElectricityAccount';
import { listElectricityInvoicesForBooking } from '@/src/db/queries/customer';
import { reopenElectricityInvoice } from '@/src/services/electricityInvoiceIntegrity';
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';

const execute = process.argv.includes('--execute');

const BOOKING_0040_ID = '70debd82-4c80-4fd7-a368-0cd7c40f7fbd';
const DHRUV_ELEC_INVOICE_ID = '6d8d46c3-115d-4a12-a4c3-808774e60473';
const PENDING_RECORD_ID = '150bc21b-8058-491c-be98-3772a9e06470';
const MISALLOCATED_PAYMENT_ID = '1363ab2b-8403-404c-a1e6-90e742d0cce0';

async function findAdmin() {
  const [row] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.role, 'super_admin'))
    .limit(1);
  if (!row) throw new Error('No super_admin');
  return row;
}

async function ensureLateFeeWaivedColumn() {
  await db.execute(sql`
    ALTER TABLE electricity_invoices
      ADD COLUMN IF NOT EXISTS late_fee_waived boolean NOT NULL DEFAULT false
  `);
}

async function main() {
  await ensureLateFeeWaivedColumn();
  const admin = await findAdmin();
  const [invBefore] = await db
    .select()
    .from(electricityInvoices)
    .where(eq(electricityInvoices.id, DHRUV_ELEC_INVOICE_ID))
    .limit(1);

  console.log('\n=== PART 1: Payment allocation investigation ===\n');
  console.log('Invoice before:', {
    number: invBefore?.invoiceNumber,
    status: invBefore?.status,
    amountPaise: invBefore?.amountPaise,
    paidPaise: invBefore?.paidPaise,
    paymentId: invBefore?.paymentId,
    firstViewedAt: invBefore?.firstViewedAt,
  });

  const [proof] = await db
    .select()
    .from(pgPaymentRecords)
    .where(eq(pgPaymentRecords.id, PENDING_RECORD_ID))
    .limit(1);

  const [alloc] = await db
    .select()
    .from(paymentApprovalAllocations)
    .where(
      and(
        eq(paymentApprovalAllocations.entityType, 'pg_payment_record'),
        eq(paymentApprovalAllocations.entityId, PENDING_RECORD_ID),
      ),
    )
    .limit(1);

  console.log('\nBulk payment proof:', {
    id: proof?.id,
    amountPaise: proof?.amountPaise,
    status: proof?.status,
    reviewedAt: proof?.reviewedAt,
    intendedFor: 'August rent + advance — NOT electricity',
  });

  console.log('\nPayment approval allocation:', alloc ?? 'none on pg_payment_record entity');

  const creditCorrection = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.action, 'dhruv_0040_credit_correction'))
    .limit(1);

  console.log('\nCredit correction audit:', creditCorrection[0]?.diff ?? 'not found');

  console.log('\n=== VERDICT ===');
  console.log('Was payment actually made for electricity? NO — bulk proof was rent/advance.');
  console.log('Wrong resident? NO — correct booking 0040.');
  console.log('Wrong invoice? NO — correct July invoice.');
  console.log('Auto repair misallocation? YES — applyElectricityAllocationForBooking via credit-correction script.');
  console.log('Incorrectly marked paid? YES — payment', MISALLOCATED_PAYMENT_ID, 'from repair, not resident payment.');

  console.log('\n=== PART 2-3: Reopen invoice + late fee waived ===\n');

  const reopen = await reopenElectricityInvoice({
    invoiceId: DHRUV_ELEC_INVOICE_ID,
    reason:
      'Dhruv never paid July electricity — misallocated by dhruv_0040_credit_correction repair script',
    waiveLateFee: true,
    actorType: 'admin',
    actorId: admin.id,
    dryRun: !execute,
  });

  if (!reopen.ok) throw new Error(reopen.reason);
  console.log('Reopen result:', reopen);

  if (execute && alloc) {
    await db
      .update(paymentApprovalAllocations)
      .set({
        electricityPaidPaise: 0,
        allocationNotes:
          'Corrected — July electricity was misallocated by repair script; invoice reopened unpaid',
        approvedAt: new Date(),
      })
      .where(eq(paymentApprovalAllocations.id, alloc.id));
    console.log('Cleared electricityPaidPaise on payment approval allocation');
  }

  const elecQuery = await listElectricityInvoicesForBooking(BOOKING_0040_ID);
  const portalRows = buildResidentBillRowsFromDetail([
    { bookingId: BOOKING_0040_ID, rent: { ok: true, data: [] }, electricity: elecQuery },
  ]);
  const account = execute ? await buildResidentElectricityAccount(BOOKING_0040_ID) : null;
  const balances = execute ? await getBookingMoneyBalances(BOOKING_0040_ID) : null;

  console.log('\n=== Portal visibility (post-repair) ===');
  console.log(
    'dueBillRows electricity:',
    portalRows.dueBillRows.filter((r) => r.label.includes('Electricity')),
  );
  if (account) {
    console.log('Resident electricity account:', {
      netOutstanding: paiseToInr(account.netOutstandingPaise),
      lateFeeWaived: account.lateFeeWaived,
      lateFee: paiseToInr(account.lateFeePaise),
    });
    console.log('Booking balances electricity outstanding:', paiseToInr(balances?.electricity.outstandingPaise ?? 0));
  }

  if (execute) {
    await db.insert(auditLog).values({
      actorType: 'admin',
      actorId: admin.id,
      entity: 'electricity_invoice',
      entityId: DHRUV_ELEC_INVOICE_ID,
      action: 'dhruv_0040_electricity_unpay_correction',
      diff: {
        previousPaymentId: MISALLOCATED_PAYMENT_ID,
        reopenedOutstandingPaise: reopen.outstandingPaise,
        lateFeeWaived: true,
      },
    });
  }

  console.log(execute ? '\nRepair applied.' : '\nDry run — pass --execute to apply.');
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});

#!/usr/bin/env npx tsx
/**
 * One-time production repair: Dhruv APG-2026-0040 (Room 102 B1).
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/repair-dhruv-0040-production.ts
 *   USE_PRODUCTION_DB=1 npx tsx scripts/repair-dhruv-0040-production.ts --execute
 */
import { and, eq, sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('repair-dhruv-0040-production.ts');

import { closeDb, db } from '@/src/db/client';
import {
  adminUsers,
  auditLog,
  bedReservations,
  beds,
  bookings,
  electricityBills,
  electricityInvoices,
  pgPaymentRecords,
  rooms,
} from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { formatDate } from '@/src/lib/dates';
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';
import { electricityDueDate } from '@/src/services/billing';
import { stampAdminDepositCreditOnBooking } from '@/src/services/depositCredit';
import {
  nextElectricityInvoiceNumber,
  projectElectricityInvoice,
} from '@/src/services/electricityBilling';
import { generateRentInvoiceForBookingAnniversary } from '@/src/services/rentInvoices';
import { correctPendingPaymentProofAmount } from '@/src/services/paymentProofCorrection';
import { finalizeStaleBookingPaymentReview } from '@/src/services/paymentProofReviewCleanup';
import { getResidentFinancialAccount } from '@/src/services/residentFinancialEngine';
import { recordResidentCredit } from '@/src/services/residentCreditLedger';
import { syncElectricityInvoiceToUnified } from '@/src/services/unifiedInvoices';

const execute = process.argv.includes('--execute');

const CUSTOMER_ID = '3cd0d0cb-5f4c-4fd9-ae8b-780664e61f1c';
const BOOKING_0040_ID = '70debd82-4c80-4fd7-a368-0cd7c40f7fbd';
const BOOKING_0040_CODE = 'APG-2026-0040';
const DUPLICATE_0093_ID = '90d7e2ca-363e-4144-b64b-14096ae2203c';
const DUPLICATE_0093_CODE = 'APG-2026-0093';
const PENDING_RECORD_ID = '150bc21b-8058-491c-be98-3772a9e06470';
const KRISHNA_0048_ID = '34e5149a-86ac-4c52-8ebc-83af7be6a042';
const KRISHNA_CUSTOMER_ID = 'f36efddc-d997-4913-b210-2506862b4f1b';
const DHRUV_ELEC_INVOICE_ID = '6d8d46c3-115d-4a12-a4c3-808774e60473';
const JULY_MONTH = '2026-07-01';
const AUGUST_MONTH = '2026-08-01';
const KUNAL_CHECKOUT_CREDIT_PAISE = 32_533;
const DHRUV_ELEC_PAISE = 67_016;
const KRISHNA_ELEC_PAISE = 54_051;
const MONTHLY_RENT_PAISE = 412_080;

async function findAdmin(): Promise<typeof adminUsers.$inferSelect> {
  const fromEnv = process.env.REPAIR_ADMIN_ID?.trim();
  if (fromEnv) {
    const [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, fromEnv)).limit(1);
    if (row) return row;
  }
  const [row] = await db
    .select()
    .from(adminUsers)
    .where(and(eq(adminUsers.role, 'super_admin'), eq(adminUsers.isActive, true)))
    .limit(1);
  if (!row) throw new Error('No super_admin found. Set REPAIR_ADMIN_ID.');
  return row;
}

async function main() {
  const admin = await findAdmin();

  const [booking0040] = await db.select().from(bookings).where(eq(bookings.id, BOOKING_0040_ID)).limit(1);
  const [duplicate] = await db.select().from(bookings).where(eq(bookings.id, DUPLICATE_0093_ID)).limit(1);
  const [pending] = await db.select().from(pgPaymentRecords).where(eq(pgPaymentRecords.id, PENDING_RECORD_ID)).limit(1);
  const [dhruvElec] = await db
    .select()
    .from(electricityInvoices)
    .where(eq(electricityInvoices.id, DHRUV_ELEC_INVOICE_ID))
    .limit(1);
  const [krishnaElec] = await db
    .select({ id: electricityInvoices.id })
    .from(electricityInvoices)
    .where(
      and(
        eq(electricityInvoices.bookingId, KRISHNA_0048_ID),
        eq(electricityInvoices.billingMonth, JULY_MONTH),
        sql`${electricityInvoices.status} <> 'cancelled'`,
      ),
    )
    .limit(1);

  if (!booking0040 || !duplicate || !pending || !dhruvElec) {
    throw new Error('Required rows missing — run diag-dhruv-0040-repair.ts first');
  }

  const paymentPaise = pending.amountPaise;
  const rentAllocatePaise = MONTHLY_RENT_PAISE;
  const otherCreditPaise = Math.max(0, paymentPaise - rentAllocatePaise);
  const balancesBefore = await getBookingMoneyBalances(BOOKING_0040_ID);

  console.log('\n=== Dhruv APG-2026-0040 one-time repair ===');
  console.log('Execute:', execute);
  console.log('Pending payment ₹', paymentPaise / 100, 'on', duplicate.bookingCode);
  console.log('Dhruv elec ₹', dhruvElec.amountPaise / 100, '→ ₹', DHRUV_ELEC_PAISE / 100);
  console.log('Krishna elec:', krishnaElec ? 'exists' : `create ₹${KRISHNA_ELEC_PAISE / 100}`);
  console.log('Approve allocation: rent ₹', rentAllocatePaise / 100, 'deposit 0 elec 0 credit ₹', otherCreditPaise / 100);
  console.log('Balances before:', balancesBefore);

  if (!execute) {
    console.log('\nDry run — pass --execute to apply.');
    await closeDb();
    return;
  }

  await db.transaction(async (tx) => {
    if (duplicate.status !== 'superseded' && duplicate.status !== 'cancelled') {
      await tx
        .update(bedReservations)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(
          and(
            eq(bedReservations.bookingId, DUPLICATE_0093_ID),
            eq(bedReservations.status, 'under_review'),
          ),
        );
      await tx
        .update(bookings)
        .set({ status: 'superseded', updatedAt: new Date() })
        .where(eq(bookings.id, DUPLICATE_0093_ID));
    }

    await tx
      .update(bedReservations)
      .set({
        stayRange: sql`daterange('2026-07-01'::date, NULL, '[)')`,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(and(eq(bedReservations.bookingId, BOOKING_0040_ID), eq(bedReservations.kind, 'primary')));

    await tx
      .update(pgPaymentRecords)
      .set({
        bookingId: BOOKING_0040_ID,
        proofSnapshotRentDuePaise: MONTHLY_RENT_PAISE,
        proofSnapshotDepositDuePaise: 0,
        proofSnapshotCheckoutTotalPaise: MONTHLY_RENT_PAISE + DHRUV_ELEC_PAISE,
        updatedAt: new Date(),
      })
      .where(eq(pgPaymentRecords.id, PENDING_RECORD_ID));
  });

  const stamp = await stampAdminDepositCreditOnBooking({
    targetBookingId: BOOKING_0040_ID,
    creditPaise: booking0040.depositPaise,
    sourceBookingId: BOOKING_0040_ID,
    sourceBookingCode: BOOKING_0040_CODE,
    adminId: admin.id,
  });
  if (!stamp.ok) throw new Error(`Deposit credit stamp failed: ${stamp.error}`);

  await db
    .update(bookings)
    .set({ depositCollectionStatus: 'full', depositDuePaise: 0, updatedAt: new Date() })
    .where(eq(bookings.id, BOOKING_0040_ID));

  const [billRow] = await db
    .select({
      billId: electricityBills.id,
      roomId: rooms.id,
    })
    .from(electricityBills)
    .innerJoin(rooms, eq(rooms.id, electricityBills.roomId))
    .where(and(eq(rooms.roomNumber, '102'), eq(electricityBills.billingMonth, JULY_MONTH)))
    .limit(1);
  if (!billRow) throw new Error('Room 102 July bill not found');

  await db
    .update(electricityBills)
    .set({
      checkoutCreditAppliedPaise: KUNAL_CHECKOUT_CREDIT_PAISE,
      monthlyOccupantCount: 2,
      updatedAt: new Date(),
    })
    .where(eq(electricityBills.id, billRow.billId));

  await db
    .update(electricityInvoices)
    .set({ amountPaise: DHRUV_ELEC_PAISE, updatedAt: new Date() })
    .where(eq(electricityInvoices.id, DHRUV_ELEC_INVOICE_ID));
  await syncElectricityInvoiceToUnified(DHRUV_ELEC_INVOICE_ID);

  if (!krishnaElec) {
    const [krishnaBed] = await db
      .select({ bedId: beds.id })
      .from(bedReservations)
      .innerJoin(beds, eq(beds.id, bedReservations.bedId))
      .where(and(eq(bedReservations.bookingId, KRISHNA_0048_ID), eq(bedReservations.kind, 'primary')))
      .limit(1);
    if (!krishnaBed) throw new Error('Krishna bed not found');

    const invoiceNumber = await nextElectricityInvoiceNumber(JULY_MONTH);
    const [inserted] = await db
      .insert(electricityInvoices)
      .values({
        invoiceNumber,
        electricityBillId: billRow.billId,
        roomId: billRow.roomId,
        bookingId: KRISHNA_0048_ID,
        customerId: KRISHNA_CUSTOMER_ID,
        bedId: krishnaBed.bedId,
        billingMonth: JULY_MONTH,
        dueDate: formatDate(electricityDueDate(new Date('2026-07-31'))),
        amountPaise: KRISHNA_ELEC_PAISE,
        unitsShare: '0',
        activeDays: 25,
        status: 'pending',
      })
      .returning({ id: electricityInvoices.id });

    await syncElectricityInvoiceToUnified(inserted!.id);
    const [invRow] = await db
      .select()
      .from(electricityInvoices)
      .where(eq(electricityInvoices.id, inserted!.id))
      .limit(1);
    if (invRow) await projectElectricityInvoice(invRow);
  }

  const augInv = await generateRentInvoiceForBookingAnniversary({
    bookingId: BOOKING_0040_ID,
    billingMonth: AUGUST_MONTH,
  });
  console.log('August rent invoice:', augInv);

  const correction = await correctPendingPaymentProofAmount({
    recordId: PENDING_RECORD_ID,
    verifiedAmountPaise: paymentPaise,
    adminId: admin.id,
    reason: 'Dhruv 0040 one-time repair — rent-only approval',
  });
  if (!correction.ok) throw new Error(correction.reason);

  const paymentId = `qr_record_${PENDING_RECORD_ID}`;
  if (augInv.invoiceId) {
    const { applyApprovedPaymentAtomic } = await import('@/src/services/paymentSettlementAtomic');
    const augPay = await applyApprovedPaymentAtomic({
      purpose: 'rent',
      provider: 'mock',
      offlineProvider: 'upi_manual',
      providerPaymentId: paymentId,
      amountPaise: rentAllocatePaise,
      invoiceId: augInv.invoiceId,
      rawPayload: { source: 'dhruv_0040_repair_aug_rent' },
    });
    if (!augPay.ok) throw new Error(augPay.reason ?? 'August rent allocation failed');
  }

  if (otherCreditPaise > 0) {
    await recordResidentCredit({
      customerId: CUSTOMER_ID,
      bookingId: BOOKING_0040_ID,
      amountPaise: otherCreditPaise,
      reason: `Dhruv 0040 repair advance credit (${paymentId})`,
    });
  }

  await finalizeStaleBookingPaymentReview({
    recordId: PENDING_RECORD_ID,
    bookingId: BOOKING_0040_ID,
    reviewedByAdminId: admin.id,
    confirmedAmountPaise: paymentPaise,
  });

  await db
    .update(pgPaymentRecords)
    .set({
      status: 'approved',
      reviewedByAdminId: admin.id,
      reviewedAt: new Date(),
      confirmedAmountPaise: paymentPaise,
      updatedAt: new Date(),
    })
    .where(eq(pgPaymentRecords.id, PENDING_RECORD_ID));

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: admin.id,
    entity: 'booking',
    entityId: BOOKING_0040_ID,
    action: 'dhruv_0040_production_repair',
    diff: {
      duplicateSuperseded: DUPLICATE_0093_CODE,
      paymentRecordId: PENDING_RECORD_ID,
      rentAllocatedPaise: rentAllocatePaise,
      dhruvElecPaise: DHRUV_ELEC_PAISE,
      krishnaElecPaise: KRISHNA_ELEC_PAISE,
    },
  });

  const balancesAfter = await getBookingMoneyBalances(BOOKING_0040_ID);
  const finAfter = await getResidentFinancialAccount(CUSTOMER_ID);
  console.log('\nDone. Balances:', balancesAfter);
  console.log('Deposit:', finAfter?.deposit);
  console.log('Dhruv elec outstanding ₹', balancesAfter.electricity.outstandingPaise / 100);

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});

/**
 * Production financial reset — removes test/spurious revenue data without changing business logic.
 * After reset, only manually entered deposits and real paid invoices count toward revenue.
 */

import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  depositLedger,
  electricityInvoices,
  financialInvoices,
  floors,
  pgs,
  rentInvoices,
  rooms,
  vacatingRequests,
} from '@/src/db/schema';
import { vacatingPenalty } from '@/src/services/billing';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import {
  previewOperatorTestDataCleanup,
  runOperatorTestDataCleanup,
  type OperatorTestDataCleanupResult,
} from '@/src/services/operatorTestDataCleanup';

const HARISH_DEPOSIT_PAISE = 150_000; // ₹1,500

export type ProductionFinancialResetPreview = {
  testCleanup: Awaited<ReturnType<typeof previewOperatorTestDataCleanup>>;
  assignmentLedgerRows: number;
  assignmentLedgerPaise: number;
  unpaidRentInvoices: number;
  unpaidElectricityInvoices: number;
  unpaidFinancialInvoices: number;
};

export type ProductionFinancialResetResult = OperatorTestDataCleanupResult & {
  removedAssignmentLedgerIds: string[];
  cancelledRentInvoiceIds: string[];
  cancelledElectricityInvoiceIds: string[];
  cancelledFinancialInvoiceIds: string[];
};

function assignmentLedgerFilter() {
  return or(
    sql`${depositLedger.reason} ILIKE '%tenant assignment%'`,
    sql`${depositLedger.reason} ILIKE '%grandfathered%'`,
    sql`${depositLedger.reason} ILIKE '%verify-deposit%'`,
    sql`${depositLedger.reason} ILIKE '%verify%'`,
  );
}

async function listAssignmentLedgerRows() {
  return db
    .select({
      id: depositLedger.id,
      amountPaise: depositLedger.amountPaise,
      reason: depositLedger.reason,
      bookingCode: bookings.bookingCode,
    })
    .from(depositLedger)
    .innerJoin(bookings, eq(bookings.id, depositLedger.bookingId))
    .where(assignmentLedgerFilter()!);
}

async function listUnpaidProductionRentIds() {
  const rows = await db
    .select({ id: rentInvoices.id })
    .from(rentInvoices)
    .innerJoin(bookings, eq(bookings.id, rentInvoices.bookingId))
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .where(
      and(
        eq(bookings.isTest, false),
        eq(customers.isTest, false),
        inArray(rentInvoices.status, ['pending', 'overdue', 'expired', 'payment_in_progress']),
        isNull(rentInvoices.paymentId),
        isNull(rentInvoices.paymentProofUrl),
      ),
    );
  return rows.map((r) => r.id);
}

async function listUnpaidProductionElectricityIds() {
  const rows = await db
    .select({ id: electricityInvoices.id })
    .from(electricityInvoices)
    .innerJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .where(
      and(
        eq(bookings.isTest, false),
        eq(customers.isTest, false),
        eq(electricityInvoices.status, 'pending'),
        isNull(electricityInvoices.paymentId),
      ),
    );
  return rows.map((r) => r.id);
}

async function listUnpaidProductionFinancialIds() {
  const rows = await db
    .select({ id: financialInvoices.id })
    .from(financialInvoices)
    .innerJoin(bookings, eq(bookings.id, financialInvoices.bookingId))
    .innerJoin(customers, eq(customers.id, financialInvoices.customerId))
    .where(
      and(
        eq(bookings.isTest, false),
        eq(customers.isTest, false),
        inArray(financialInvoices.status, [
          'draft',
          'sent',
          'overdue',
          'expired',
          'payment_in_progress',
        ]),
        isNull(financialInvoices.paidAt),
      ),
    );
  return rows.map((r) => r.id);
}

export async function previewProductionFinancialReset(): Promise<ProductionFinancialResetPreview> {
  const [testCleanup, assignmentRows, rentIds, elecIds, finIds] = await Promise.all([
    previewOperatorTestDataCleanup(),
    listAssignmentLedgerRows(),
    listUnpaidProductionRentIds(),
    listUnpaidProductionElectricityIds(),
    listUnpaidProductionFinancialIds(),
  ]);

  return {
    testCleanup,
    assignmentLedgerRows: assignmentRows.length,
    assignmentLedgerPaise: assignmentRows.reduce((s, r) => s + Math.abs(r.amountPaise), 0),
    unpaidRentInvoices: rentIds.length,
    unpaidElectricityInvoices: elecIds.length,
    unpaidFinancialInvoices: finIds.length,
  };
}

export async function runProductionFinancialReset(): Promise<ProductionFinancialResetResult> {
  const testResult = await runOperatorTestDataCleanup();

  const assignmentRows = await listAssignmentLedgerRows();
  const assignmentIds = assignmentRows.map((r) => r.id);

  const [rentIds, elecIds, finIds] = await Promise.all([
    listUnpaidProductionRentIds(),
    listUnpaidProductionElectricityIds(),
    listUnpaidProductionFinancialIds(),
  ]);

  await db.transaction(async (tx) => {
    if (assignmentIds.length > 0) {
      await tx.delete(depositLedger).where(inArray(depositLedger.id, assignmentIds));
    }

    if (rentIds.length > 0) {
      await tx
        .update(rentInvoices)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: 'Production financial reset — unpaid auto invoice removed',
          updatedAt: new Date(),
        })
        .where(inArray(rentInvoices.id, rentIds));
    }

    if (elecIds.length > 0) {
      await tx
        .update(electricityInvoices)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(inArray(electricityInvoices.id, elecIds));
    }

    if (finIds.length > 0) {
      await tx
        .update(financialInvoices)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: 'Production financial reset — unpaid invoice removed',
          updatedAt: new Date(),
        })
        .where(inArray(financialInvoices.id, finIds));
    }
  });

  const { reconcileStaleFinancialInvoices } = await import('@/src/lib/billing/financialMetrics');
  await reconcileStaleFinancialInvoices().catch(() => undefined);
  const { resolveStaleBillingActionItems } = await import('@/src/services/actionItems');
  await resolveStaleBillingActionItems().catch(() => undefined);

  return {
    ...testResult,
    removedAssignmentLedgerIds: assignmentIds,
    cancelledRentInvoiceIds: rentIds,
    cancelledElectricityInvoiceIds: elecIds,
    cancelledFinancialInvoiceIds: finIds,
  };
}

export type HarishCorrectionResult =
  | {
      ok: true;
      bookingId: string;
      bookingCode: string;
      customerName: string;
      collectedPaise: number;
      deductionPaise: number;
      balancePaise: number;
    }
  | { ok: false; error: string };

/** Isolate Harish (Shantinagar, Room 203, B5) to ₹1,500 deposit + vacating penalty only. */
export async function fixHarishDepositWallet(adminId: string): Promise<HarishCorrectionResult> {
  const [row] = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      customerName: customers.fullName,
      pricingSnapshot: bookings.pricingSnapshot,
      depositPaise: bookings.depositPaise,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        eq(bedReservations.kind, 'primary'),
        sql`${pgs.name} ILIKE ${'%shantinagar%'}`,
        eq(rooms.roomNumber, '203'),
        sql`${beds.bedCode} ILIKE ${'B5%'}`,
        sql`${customers.fullName} ILIKE ${'%harish%'}`,
      ),
    )
    .limit(1);

  if (!row) {
    return { ok: false, error: 'Harish booking not found (Shantinagar, Room 203, B5).' };
  }

  const [vacating] = await db
    .select({ deductionPaise: vacatingRequests.deductionPaise })
    .from(vacatingRequests)
    .where(eq(vacatingRequests.bookingId, row.bookingId))
    .orderBy(sql`${vacatingRequests.createdAt} DESC`)
    .limit(1);

  const snapshot = (row.pricingSnapshot ?? { perBed: [] }) as PricingSnapshot;
  const monthlyRent =
    snapshot.perBed?.reduce((a, b) => a + (b.monthlyRatePaise ?? 0), 0) ?? row.depositPaise;
  const penaltyPaise = vacating?.deductionPaise ?? vacatingPenalty(monthlyRent);

  await db.transaction(async (tx) => {
    await tx.delete(depositLedger).where(eq(depositLedger.bookingId, row.bookingId));

    await tx.insert(depositLedger).values({
      bookingId: row.bookingId,
      customerId: row.customerId,
      entryKind: 'collected',
      amountPaise: HARISH_DEPOSIT_PAISE,
      reason: 'ADVANCE_DEPOSIT — verified manual record (Harish correction)',
      createdByAdminId: adminId,
    });

    if (penaltyPaise > 0) {
      await tx.insert(depositLedger).values({
        bookingId: row.bookingId,
        customerId: row.customerId,
        entryKind: 'deducted',
        amountPaise: -penaltyPaise,
        reason: 'vacating notice short — 5-day rent penalty',
        createdByAdminId: adminId,
      });
    }

    await tx
      .update(bookings)
      .set({ depositPaise: HARISH_DEPOSIT_PAISE, updatedAt: new Date() })
      .where(eq(bookings.id, row.bookingId));
  });

  const balancePaise = HARISH_DEPOSIT_PAISE - penaltyPaise;

  return {
    ok: true,
    bookingId: row.bookingId,
    bookingCode: row.bookingCode,
    customerName: row.customerName,
    collectedPaise: HARISH_DEPOSIT_PAISE,
    deductionPaise: penaltyPaise,
    balancePaise,
  };
}

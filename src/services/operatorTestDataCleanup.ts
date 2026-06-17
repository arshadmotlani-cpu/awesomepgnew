import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  bookings,
  customers,
  depositLedger,
  financialInvoices,
  rentInvoices,
} from '@/src/db/schema';

export const OPERATOR_EMAIL = 'arshadmotlani@gmail.com';

const JUNE_2026_START = sql`'2026-06-01'::timestamptz`;
const JUNE_2026_END = sql`'2026-07-01'::timestamptz`;

export type OperatorTestDataCleanupResult = {
  markedCustomerIds: string[];
  markedBookingIds: string[];
  cancelledBookingIds: string[];
  removedDeductionIds: string[];
  removedLedgerIds: string[];
  removedDeductionPaise: number;
};

function isTestCustomerSql() {
  return sql`(
    lower(${customers.email}) = ${OPERATOR_EMAIL}
    OR ${customers.email} LIKE '%@example.com'
    OR ${customers.email} LIKE '%@awesomepg.local'
    OR ${customers.fullName} LIKE 'Phase5.5%'
    OR ${customers.fullName} LIKE 'E2E User%'
    OR ${customers.fullName} LIKE 'Verification Bot%'
    OR ${customers.fullName} LIKE 'Phase5%'
  )`;
}

function isTestDeductionFilter() {
  return sql`(
    ${isTestCustomerSql()}
    OR ${depositLedger.reason} LIKE '%verify-deposit%'
    OR ${depositLedger.reason} LIKE '%verify%'
    OR ${customers.fullName} LIKE 'Phase5.5%'
    OR ${customers.fullName} LIKE 'E2E User%'
    OR ${customers.fullName} LIKE 'Verification Bot%'
    OR ${customers.fullName} LIKE 'Phase5%'
  )`;
}

/** June "other deposit charges" that inflate Overview extra income. */
async function listJuneOtherDepositDeductions() {
  return db
    .select({
      id: depositLedger.id,
      amountPaise: depositLedger.amountPaise,
      reason: depositLedger.reason,
      bookingCode: bookings.bookingCode,
      email: customers.email,
    })
    .from(depositLedger)
    .innerJoin(bookings, eq(bookings.id, depositLedger.bookingId))
    .innerJoin(customers, eq(customers.id, depositLedger.customerId))
    .where(
      and(
        eq(depositLedger.entryKind, 'deducted'),
        isNull(depositLedger.relatedVacatingId),
        sql`${depositLedger.createdAt} >= ${JUNE_2026_START}`,
        sql`${depositLedger.createdAt} < ${JUNE_2026_END}`,
      ),
    );
}

async function listJuneTestPatternDeductions() {
  return db
    .select({
      id: depositLedger.id,
      amountPaise: depositLedger.amountPaise,
      reason: depositLedger.reason,
      bookingCode: bookings.bookingCode,
      email: customers.email,
    })
    .from(depositLedger)
    .innerJoin(bookings, eq(bookings.id, depositLedger.bookingId))
    .innerJoin(customers, eq(customers.id, depositLedger.customerId))
    .where(
      and(
        eq(depositLedger.entryKind, 'deducted'),
        sql`${depositLedger.createdAt} >= ${JUNE_2026_START}`,
        sql`${depositLedger.createdAt} < ${JUNE_2026_END}`,
        isTestDeductionFilter(),
      ),
    );
}

async function listTestCustomers() {
  return db
    .select({ id: customers.id, fullName: customers.fullName, email: customers.email })
    .from(customers)
    .where(isTestCustomerSql());
}

export async function previewOperatorTestDataCleanup() {
  const testCustomers = await listTestCustomers();

  const operatorBookings =
    testCustomers.length > 0
      ? await db
          .select({
            id: bookings.id,
            bookingCode: bookings.bookingCode,
            status: bookings.status,
            customerId: bookings.customerId,
          })
          .from(bookings)
          .where(
            inArray(
              bookings.customerId,
              testCustomers.map((c) => c.id),
            ),
          )
          .orderBy(bookings.createdAt)
      : [];

  const [juneOtherDeductions, testPatternDeductions] = await Promise.all([
    listJuneOtherDepositDeductions(),
    listJuneTestPatternDeductions(),
  ]);

  const deductionById = new Map<string, (typeof juneOtherDeductions)[number]>();
  for (const row of [...juneOtherDeductions, ...testPatternDeductions]) {
    deductionById.set(row.id, row);
  }
  const testDeductions = [...deductionById.values()];

  const activeBookingIds = operatorBookings
    .filter((b) => b.status !== 'cancelled' && b.status !== 'refunded')
    .map((b) => b.id);

  const removedDeductionPaise = testDeductions.reduce(
    (sum, row) => sum + Math.abs(row.amountPaise),
    0,
  );

  return {
    operator: testCustomers.find((c) => c.email.toLowerCase() === OPERATOR_EMAIL) ?? testCustomers[0],
    testCustomers,
    operatorBookings,
    testDeductions,
    juneOtherDeductionCount: juneOtherDeductions.length,
    activeBookingIds,
    removedDeductionPaise,
  };
}

export async function runOperatorTestDataCleanup(): Promise<OperatorTestDataCleanupResult> {
  const preview = await previewOperatorTestDataCleanup();
  const testCustomerIds = preview.testCustomers.map((c) => c.id);
  const testBookingIds = preview.operatorBookings.map((b) => b.id);
  const deductionIds = preview.testDeductions.map((row) => row.id);

  const removedLedgerIds: string[] = [];

  await db.transaction(async (tx) => {
    if (testCustomerIds.length > 0) {
      await tx
        .update(customers)
        .set({ isTest: true, updatedAt: new Date() })
        .where(inArray(customers.id, testCustomerIds));
    }

    if (testBookingIds.length > 0) {
      await tx
        .update(bookings)
        .set({ isTest: true, updatedAt: new Date() })
        .where(inArray(bookings.id, testBookingIds));

      const ledgerRows = await tx
        .select({ id: depositLedger.id })
        .from(depositLedger)
        .where(inArray(depositLedger.bookingId, testBookingIds));
      if (ledgerRows.length > 0) {
        const ids = ledgerRows.map((r) => r.id);
        await tx.delete(depositLedger).where(inArray(depositLedger.id, ids));
        removedLedgerIds.push(...ids);
      }

      await tx
        .update(rentInvoices)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(
          and(
            inArray(rentInvoices.bookingId, testBookingIds),
            inArray(rentInvoices.status, ['pending', 'overdue', 'payment_in_progress']),
          ),
        );

      await tx
        .update(financialInvoices)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(
          and(
            inArray(financialInvoices.bookingId, testBookingIds),
            inArray(financialInvoices.status, [
              'draft',
              'sent',
              'overdue',
              'payment_in_progress',
            ]),
          ),
        );
    }

    if (preview.activeBookingIds.length > 0) {
      await tx
        .update(bedReservations)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(
          and(
            inArray(bedReservations.bookingId, preview.activeBookingIds),
            inArray(bedReservations.status, ['hold', 'active']),
          ),
        );

      await tx
        .update(bookings)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(inArray(bookings.id, preview.activeBookingIds));
    }

    if (deductionIds.length > 0) {
      await tx.delete(depositLedger).where(inArray(depositLedger.id, deductionIds));
      removedLedgerIds.push(...deductionIds);
    }
  });

  return {
    markedCustomerIds: testCustomerIds,
    markedBookingIds: testBookingIds,
    cancelledBookingIds: preview.activeBookingIds,
    removedDeductionIds: deductionIds,
    removedLedgerIds,
    removedDeductionPaise: preview.removedDeductionPaise,
  };
}

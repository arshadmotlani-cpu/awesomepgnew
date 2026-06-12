import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  bookings,
  customers,
  depositLedger,
  rentInvoices,
} from '@/src/db/schema';

export const OPERATOR_EMAIL = 'arshadmotlani@gmail.com';

const JUNE_2026_START = sql`'2026-06-01'::timestamptz`;
const JUNE_2026_END = sql`'2026-07-01'::timestamptz`;

export type OperatorTestDataCleanupResult = {
  cancelledBookingIds: string[];
  removedDeductionIds: string[];
  removedDeductionPaise: number;
};

function isTestDeductionFilter() {
  return sql`(
    lower(${customers.email}) = ${OPERATOR_EMAIL}
    OR ${customers.email} LIKE '%@example.com'
    OR ${customers.email} LIKE '%@awesomepg.local'
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

export async function previewOperatorTestDataCleanup() {
  const [customer] = await db
    .select({ id: customers.id, fullName: customers.fullName })
    .from(customers)
    .where(sql`lower(${customers.email}) = ${OPERATOR_EMAIL}`)
    .limit(1);

  const operatorBookings = customer
    ? await db
        .select({
          id: bookings.id,
          bookingCode: bookings.bookingCode,
          status: bookings.status,
        })
        .from(bookings)
        .where(eq(bookings.customerId, customer.id))
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
    operator: customer,
    operatorBookings,
    testDeductions,
    juneOtherDeductionCount: juneOtherDeductions.length,
    activeBookingIds,
    removedDeductionPaise,
  };
}

export async function runOperatorTestDataCleanup(): Promise<OperatorTestDataCleanupResult> {
  const preview = await previewOperatorTestDataCleanup();
  const deductionIds = preview.testDeductions.map((row) => row.id);

  await db.transaction(async (tx) => {
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

      await tx
        .update(rentInvoices)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(
          and(
            inArray(rentInvoices.bookingId, preview.activeBookingIds),
            inArray(rentInvoices.status, ['pending', 'overdue']),
          ),
        );

      await tx.delete(depositLedger).where(inArray(depositLedger.bookingId, preview.activeBookingIds));
    }

    if (deductionIds.length > 0) {
      await tx.delete(depositLedger).where(inArray(depositLedger.id, deductionIds));
    }
  });

  return {
    cancelledBookingIds: preview.activeBookingIds,
    removedDeductionIds: deductionIds,
    removedDeductionPaise: preview.removedDeductionPaise,
  };
}

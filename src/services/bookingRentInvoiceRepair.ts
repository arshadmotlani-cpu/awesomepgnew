import { and, eq, or, isNull } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  depositLedger,
  financialInvoices,
  payments,
  rentInvoices,
} from '@/src/db/schema';
import { getBusinessMetricsSummary } from '@/src/db/queries/admin';
import { lookupFinancialInvoiceIdBySource } from '@/src/lib/billing/invoiceNumbering.server';
import { allocateBookingCheckoutPayment } from '@/src/lib/billing/bookingPaymentAllocation';
import { firstOfMonth } from '@/src/services/billing';
import {
  computeBookingRentPaisePaid,
  ensureBookingRentInvoiceForExistingPayment,
} from '@/src/services/bookingPaymentInvoices';
import { getInvoiceCommandCenterData, type InvoiceDailySummary } from '@/src/services/invoiceCommandCenter';
import { loadResidentAccountContext } from '@/src/services/residentAccountContext';
import { syncRentInvoiceToUnified } from '@/src/services/unifiedInvoices';

export type BookingRentAuditRow = {
  bookingCode: string;
  bookingId: string;
  status: string;
  bedCode: string | null;
  depositHeldPaise: number;
  payment: {
    id: string;
    amountPaise: number;
    status: string;
    paidAt: string | null;
  } | null;
  allocation: ReturnType<typeof allocateBookingCheckoutPayment> | null;
  rentInvoices: Array<{
    id: string;
    invoiceNumber: string;
    status: string;
    rentPaise: number;
    paidPrincipalPaise: number;
    paymentId: string | null;
    billingMonth: string;
  }>;
  financialInvoices: Array<{
    id: string;
    invoiceNumber: string;
    status: string;
    sourceTable: string | null;
    sourceId: string | null;
    amountPaise: number;
  }>;
  rentInvoiceLinkedToPayment: boolean;
  financialInvoiceLinked: boolean;
  incomeRentPaiseForBillingMonth: number;
  billingMonth: string;
  residentRentHistoryPaise: number;
  commandCenterRentPaise: number | null;
  commandCenterTodayRentPaise: number | null;
  commandCenterDate: string | null;
  commandCenterToday: string | null;
  commandCenterPaymentDaySummary: InvoiceDailySummary | null;
  checks: {
    q1_rentInvoiceExists: boolean;
    q2_financialInvoiceExists: boolean;
    q3_revenueEntryExists: boolean;
    q4_residentHistoryShowsRent: boolean;
    q5_adminInvoiceCenterShows: boolean;
    q6_incomeRentPaiseIncludesBooking: boolean;
  };
};

export type BookingRentRepairMatrixRow = {
  bookingCode: string;
  rentInvoiceId: string | null;
  financialInvoiceId: string | null;
  revenueImpactPaise: number;
  expectedRentPaise: number;
  depositHeldPaise: number;
  overallPass: boolean;
} & BookingRentAuditRow['checks'];

export type BookingRentInvoiceRepairReport = {
  verifiedAt: string;
  execute: boolean;
  bookingCodes: string[];
  revenueBefore: Record<string, unknown>;
  revenueAfter: Record<string, unknown>;
  auditBefore: BookingRentAuditRow[];
  auditAfter: BookingRentAuditRow[];
  repairResults: unknown[];
  matrix: BookingRentRepairMatrixRow[];
  overallPass: boolean;
};

async function depositHeldPaise(bookingId: string): Promise<number> {
  const rows = await db
    .select({ amountPaise: depositLedger.amountPaise, entryKind: depositLedger.entryKind })
    .from(depositLedger)
    .where(eq(depositLedger.bookingId, bookingId));
  let held = 0;
  for (const r of rows) {
    if (r.entryKind === 'collected') held += r.amountPaise;
    if (r.entryKind === 'refunded' || r.entryKind === 'deducted') held -= Math.abs(r.amountPaise);
  }
  return Math.max(0, held);
}

export async function auditBookingRentInvoice(
  bookingCode: string,
): Promise<BookingRentAuditRow | null> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.bookingCode, bookingCode))
    .limit(1);
  if (!booking) return null;

  const [bedRow] = await db
    .select({ bedCode: beds.bedCode })
    .from(bedReservations)
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(and(eq(bedReservations.bookingId, booking.id), eq(bedReservations.kind, 'primary')))
    .limit(1);

  const pays = await db
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, booking.id), eq(payments.purpose, 'booking')))
    .orderBy(payments.paidAt);

  const succeeded = pays.find((p) => p.status === 'succeeded' && p.amountPaise > 0) ?? null;
  const allocation = succeeded
    ? allocateBookingCheckoutPayment(booking, succeeded.amountPaise)
    : null;

  const rentInvs = await db
    .select({
      id: rentInvoices.id,
      invoiceNumber: rentInvoices.invoiceNumber,
      status: rentInvoices.status,
      rentPaise: rentInvoices.rentPaise,
      paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
      paymentId: rentInvoices.paymentId,
      billingMonth: rentInvoices.billingMonth,
    })
    .from(rentInvoices)
    .where(eq(rentInvoices.bookingId, booking.id));

  const finInvs = await db
    .select({
      id: financialInvoices.id,
      invoiceNumber: financialInvoices.invoiceNumber,
      status: financialInvoices.status,
      sourceTable: financialInvoices.sourceTable,
      sourceId: financialInvoices.sourceId,
      amountPaise: financialInvoices.amountPaise,
    })
    .from(financialInvoices)
    .where(eq(financialInvoices.bookingId, booking.id));

  const finByRent = await batchLookupFinancialInvoiceIds(
    rentInvs.map((r) => ({ sourceTable: 'rent_invoices' as const, sourceId: r.id })),
  );

  const paymentDate = succeeded?.paidAt
    ? succeeded.paidAt.toISOString().slice(0, 10)
    : booking.createdAt.toISOString().slice(0, 10);
  const billingMonth = firstOfMonth(paymentDate);

  const metrics = await getBusinessMetricsSummary(billingMonth);
  const globalIncomeRent = metrics.ok ? metrics.data.incomeRentPaise : 0;

  const expectedRent = succeeded
    ? computeBookingRentPaisePaid({ booking, paymentAmountPaise: succeeded.amountPaise })
    : 0;

  const incomeRentPaise =
    metrics.ok && succeeded
      ? rentInvs
          .filter(
            (r) =>
              r.status === 'paid' &&
              r.billingMonth === billingMonth &&
              (r.paymentId === succeeded.id || r.paidPrincipalPaise > 0),
          )
          .reduce((a, r) => a + r.paidPrincipalPaise, 0)
      : 0;

  const accountCtx = await loadResidentAccountContext(booking.customerId);
  const rentHistory = accountCtx?.rentPaymentHistory ?? [];
  const residentRentHistoryPaise =
    rentHistory.filter((h) => rentInvs.some((r) => r.id === h.id)).reduce((a, h) => a + h.paidPaise, 0) ||
    rentHistory.reduce((a, h) => a + h.paidPaise, 0);

  let commandCenterRentPaise: number | null = null;
  let commandCenterTodayRentPaise: number | null = null;
  let commandCenterPaymentDaySummary: InvoiceDailySummary | null = null;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const ccPaymentDay = await getInvoiceCommandCenterData(paymentDate);
    commandCenterRentPaise = ccPaymentDay.summary.rentCollectedPaise;
    commandCenterPaymentDaySummary = ccPaymentDay.summary;
    const ccToday = await getInvoiceCommandCenterData(today);
    commandCenterTodayRentPaise = ccToday.summary.rentCollectedPaise;
  } catch {
    commandCenterRentPaise = null;
    commandCenterTodayRentPaise = null;
    commandCenterPaymentDaySummary = null;
  }

  const linkedRent = succeeded
    ? rentInvs.some((r) => r.status === 'paid' && r.paymentId === succeeded.id)
    : false;
  const linkedFin = await Promise.all(
    rentInvs.map((r) => lookupFinancialInvoiceIdBySource('rent_invoices', r.id)),
  ).then((ids) => ids.some((id) => id != null));

  const checks = {
    q1_rentInvoiceExists: rentInvs.some((r) => r.status === 'paid' && r.paidPrincipalPaise > 0),
    q2_financialInvoiceExists: linkedFin || finInvs.length > 0,
    q3_revenueEntryExists:
      globalIncomeRent > 0 ||
      (linkedRent && rentInvs.some((r) => r.paidPrincipalPaise >= expectedRent && expectedRent > 0)),
    q4_residentHistoryShowsRent: residentRentHistoryPaise >= expectedRent && expectedRent > 0,
    q5_adminInvoiceCenterShows:
      (commandCenterRentPaise ?? 0) >= expectedRent && expectedRent > 0,
    q6_incomeRentPaiseIncludesBooking:
      incomeRentPaise >= expectedRent && expectedRent > 0,
  };

  return {
    bookingCode,
    bookingId: booking.id,
    status: booking.status,
    bedCode: bedRow?.bedCode ?? null,
    depositHeldPaise: await depositHeldPaise(booking.id),
    payment: succeeded
      ? {
          id: succeeded.id,
          amountPaise: succeeded.amountPaise,
          status: succeeded.status,
          paidAt: succeeded.paidAt?.toISOString() ?? null,
        }
      : null,
    allocation,
    rentInvoices: rentInvs,
    financialInvoices: finInvs,
    rentInvoiceLinkedToPayment: linkedRent,
    financialInvoiceLinked: linkedFin,
    incomeRentPaiseForBillingMonth: incomeRentPaise,
    billingMonth,
    residentRentHistoryPaise,
    commandCenterRentPaise,
    commandCenterTodayRentPaise,
    commandCenterDate: paymentDate,
    commandCenterToday: today,
    commandCenterPaymentDaySummary,
    checks,
  };
}

async function reconcileRentInvoiceTimestamps(bookingCode: string): Promise<Record<string, unknown>> {
  const [booking] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.bookingCode, bookingCode))
    .limit(1);
  if (!booking) return { bookingCode, error: 'not found' };

  const pays = await db
    .select({ id: payments.id, paidAt: payments.paidAt })
    .from(payments)
    .where(
      and(
        eq(payments.bookingId, booking.id),
        eq(payments.purpose, 'booking'),
        eq(payments.status, 'succeeded'),
      ),
    );

  const fixes: unknown[] = [];
  for (const pay of pays) {
    if (!pay.paidAt) continue;
    const [rentInv] = await db
      .select({ id: rentInvoices.id, paidAt: rentInvoices.paidAt, paymentId: rentInvoices.paymentId })
      .from(rentInvoices)
      .where(
        and(
          eq(rentInvoices.bookingId, booking.id),
          eq(rentInvoices.status, 'paid'),
          or(eq(rentInvoices.paymentId, pay.id), isNull(rentInvoices.paymentId)),
        ),
      )
      .limit(1);
    if (!rentInv) continue;

    const paymentDay = pay.paidAt.toISOString().slice(0, 10);
    const rentPaidDay = rentInv.paidAt?.toISOString().slice(0, 10) ?? null;
    const needsPaidAt = rentPaidDay !== paymentDay;
    const needsPaymentLink = rentInv.paymentId !== pay.id;

    if (needsPaidAt || needsPaymentLink) {
      await db
        .update(rentInvoices)
        .set({
          paidAt: pay.paidAt,
          paymentId: pay.id,
          updatedAt: new Date(),
        })
        .where(eq(rentInvoices.id, rentInv.id));
      await syncRentInvoiceToUnified(rentInv.id);
      fixes.push({
        rentInvoiceId: rentInv.id,
        paymentId: pay.id,
        paymentDay,
        previousRentPaidDay: rentPaidDay,
        needsPaidAt,
        needsPaymentLink,
      });
    } else {
      await syncRentInvoiceToUnified(rentInv.id);
      fixes.push({ rentInvoiceId: rentInv.id, action: 'sync only' });
    }
  }

  return { bookingCode, fixes };
}

async function repairBookingRentInvoice(bookingCode: string): Promise<Record<string, unknown>> {
  const [booking] = await db
    .select({ id: bookings.id, bookingCode: bookings.bookingCode })
    .from(bookings)
    .where(eq(bookings.bookingCode, bookingCode))
    .limit(1);
  if (!booking) return { bookingCode, error: 'not found' };

  const pays = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.bookingId, booking.id),
        eq(payments.purpose, 'booking'),
        eq(payments.status, 'succeeded'),
      ),
    );

  const actions: unknown[] = [];
  for (const p of pays) {
    const beforeRent = await db
      .select({ id: rentInvoices.id })
      .from(rentInvoices)
      .where(and(eq(rentInvoices.bookingId, booking.id), eq(rentInvoices.paymentId, p.id)));
    const result = await ensureBookingRentInvoiceForExistingPayment(p.id);
    actions.push({ paymentId: p.id, beforeRentCount: beforeRent.length, result });
    if ('invoiceId' in result && result.invoiceId) {
      await syncRentInvoiceToUnified(result.invoiceId);
    }
  }

  return { bookingCode, actions };
}

async function revenueSnapshot(billingMonth: string) {
  const summary = await getBusinessMetricsSummary(billingMonth);
  if (!summary.ok) return { error: summary.error };
  return {
    billingMonth,
    incomeRentPaise: summary.data.incomeRentPaise,
    incomeTotalPaise: summary.data.incomeTotalPaise,
  };
}

async function buildMatrix(afterAudits: BookingRentAuditRow[]): Promise<BookingRentRepairMatrixRow[]> {
  const matrix: BookingRentRepairMatrixRow[] = [];
  for (const row of afterAudits) {
    const expectedRent = row.allocation?.rentPaise ?? 0;
    const paidRent = row.rentInvoices.find(
      (r) => r.status === 'paid' && r.paymentId === row.payment?.id,
    );
    const finId = paidRent
      ? await lookupFinancialInvoiceIdBySource('rent_invoices', paidRent.id)
      : null;

    matrix.push({
      bookingCode: row.bookingCode,
      rentInvoiceId: paidRent?.id ?? null,
      financialInvoiceId: finId ?? null,
      revenueImpactPaise: paidRent?.paidPrincipalPaise ?? 0,
      expectedRentPaise: expectedRent,
      depositHeldPaise: row.depositHeldPaise,
      ...row.checks,
      overallPass: Object.values(row.checks).every(Boolean),
    });
  }
  return matrix;
}

export async function runBookingRentInvoiceAuditRepair(input: {
  bookingCodes: string[];
  execute: boolean;
}): Promise<BookingRentInvoiceRepairReport> {
  const billingMonths = new Set<string>();
  const auditBefore: BookingRentAuditRow[] = [];

  for (const code of input.bookingCodes) {
    const row = await auditBookingRentInvoice(code);
    if (row) {
      auditBefore.push(row);
      billingMonths.add(row.billingMonth);
    }
  }

  const revenueBefore: Record<string, unknown> = {};
  for (const m of billingMonths) {
    revenueBefore[m] = await revenueSnapshot(m);
  }

  const repairResults: unknown[] = [];
  if (input.execute) {
    for (const code of input.bookingCodes) {
      const auditRow = auditBefore.find((a) => a.bookingCode === code);
      const shouldCreateOrLink =
        auditRow?.payment &&
        auditRow.depositHeldPaise > 0 &&
        (!auditRow.rentInvoiceLinkedToPayment ||
          !auditRow.financialInvoiceLinked ||
          (auditRow.allocation?.rentPaise ?? 0) > (auditRow.commandCenterRentPaise ?? 0));

      if (shouldCreateOrLink) {
        repairResults.push(await repairBookingRentInvoice(code));
      }

      const reconcile = await reconcileRentInvoiceTimestamps(code);
      if (reconcile.fixes && Array.isArray(reconcile.fixes) && reconcile.fixes.length > 0) {
        repairResults.push(reconcile);
      } else if (!shouldCreateOrLink) {
        if (auditRow && !auditRow.financialInvoiceLinked) {
          for (const ri of auditRow.rentInvoices) {
            await syncRentInvoiceToUnified(ri.id);
          }
          repairResults.push({ bookingCode: code, action: 'synced financial invoices only' });
        } else {
          repairResults.push({
            bookingCode: code,
            action: 'skipped — already linked or no payment',
          });
        }
      }
    }
  }

  const auditAfter: BookingRentAuditRow[] = [];
  for (const code of input.bookingCodes) {
    const row = await auditBookingRentInvoice(code);
    if (row) auditAfter.push(row);
  }

  const revenueAfter: Record<string, unknown> = {};
  for (const m of billingMonths) {
    revenueAfter[m] = await revenueSnapshot(m);
  }

  const matrix = await buildMatrix(auditAfter);

  return {
    verifiedAt: new Date().toISOString(),
    execute: input.execute,
    bookingCodes: input.bookingCodes,
    revenueBefore,
    revenueAfter,
    auditBefore,
    auditAfter,
    repairResults,
    matrix,
    overallPass: matrix.length > 0 && matrix.every((m) => m.overallPass),
  };
}

export const DEFAULT_BOOKING_RENT_REPAIR_CODES = ['APG-2026-0035', 'APG-2026-0036'] as const;

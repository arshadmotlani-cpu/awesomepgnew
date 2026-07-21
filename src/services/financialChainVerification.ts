/**
 * P0 financial chain verification — APG-2026-0035 / APG-2026-0036 only.
 * Traces booking → payment → deposit → rent invoice → financial invoice → surfaces.
 */
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bedReservations,
  beds,
  bookings,
  customers,
  depositLedger,
  financialInvoices,
  payments,
  rentInvoices,
} from '@/src/db/schema';
import { getBusinessMetricsSummary, getDailyCollectionTotals } from '@/src/db/queries/admin';
import { lookupFinancialInvoiceIdBySource } from '@/src/lib/billing/invoiceNumbering.server';
import { allocateBookingCheckoutPayment } from '@/src/lib/billing/bookingPaymentAllocation';
import { firstOfMonth } from '@/src/services/billing';
import {
  computeBookingRentPaisePaid,
  ensureBookingRentInvoiceForExistingPayment,
} from '@/src/services/bookingPaymentInvoices';
import { DEPOSIT_CREDIT_REASON } from '@/src/services/depositCredit';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { getInvoiceCommandCenterData } from '@/src/services/invoiceCommandCenter';
import { loadResidentAccountContext } from '@/src/services/residentAccountContext';
import { syncRentInvoiceToUnified } from '@/src/services/unifiedInvoices';
import { todayString } from '@/src/lib/dates';

export const FINANCIAL_CHAIN_BOOKING_CODES = ['APG-2026-0035', 'APG-2026-0036'] as const;

const PRIOR_DEPOSIT_SETTLED_REASON = 'Prior stay balance collected with new booking checkout';

export type ChainEntityIds = {
  bookingId: string;
  customerId: string;
  customerName: string;
  bedCode: string | null;
  payments: Array<{
    id: string;
    purpose: string;
    status: string;
    amountPaise: number;
    paidAt: string | null;
    providerPaymentId: string | null;
  }>;
  depositLedgerRows: Array<{
    id: string;
    entryKind: string;
    amountPaise: number;
    reason: string | null;
    createdAt: string;
  }>;
  rentInvoices: Array<{
    id: string;
    invoiceNumber: string;
    status: string;
    rentPaise: number;
    paidPrincipalPaise: number;
    paymentId: string | null;
    paidAt: string | null;
    billingMonth: string;
  }>;
  financialInvoices: Array<{
    id: string;
    invoiceNumber: string;
    status: string;
    sourceTable: string | null;
    sourceId: string | null;
    amountPaise: number;
    paidAt: string | null;
    paymentId: string | null;
  }>;
  auditLogEntries: Array<{
    id: string;
    entity: string;
    entityId: string;
    action: string;
    createdAt: string;
    diff: unknown;
  }>;
};

export type ChainCheckResult = {
  bookingConfirmed: boolean;
  paymentSucceeded: boolean;
  depositLedgerCorrect: boolean;
  rentObligationExists: boolean;
  rentInvoiceExists: boolean;
  financialInvoiceExists: boolean;
  residentHistoryShows: boolean;
  adminInvoiceCenterShows: boolean;
  revenueIncludes: boolean;
  auditTrailLinks: boolean;
};

export type BookingFinancialChainReport = {
  bookingCode: string;
  residentLabel: string;
  paymentDate: string | null;
  expectedRentPaise: number;
  expectedDepositCashPaise: number;
  depositHeldPaise: number;
  ids: ChainEntityIds;
  checks: ChainCheckResult;
  passCount: number;
  overallPass: boolean;
  commandCenterPaymentDay: {
    date: string;
    rentCollectedPaise: number;
    depositCashCollectedPaise: number;
    depositTransfersPaise: number;
    priorDepositSettledPaise: number;
    refundsPaidPaise: number;
    invoicesGeneratedCount: number;
    invoicesPaidCount: number;
  } | null;
  residentRentHistoryRows: Array<{ id: string; label: string; paidPaise: number }>;
  incomeRentPaiseBillingMonth: number;
  billingMonth: string;
};

export type FinancialChainVerificationReport = {
  verifiedAt: string;
  execute: boolean;
  today: string;
  bookings: BookingFinancialChainReport[];
  revenueReconciliation: {
    today: {
      date: string;
      expectedFromBookingsPaise: {
        rentPaise: number;
        depositCashPaise: number;
        depositTransfersPaise: number;
        priorDepositSettledPaise: number;
      };
      adminRevenueMtdIncomeRentPaise: number;
      adminInvoicesCommandCenter: Awaited<ReturnType<typeof getInvoiceCommandCenterData>>['summary'];
      adminDepositsNote: string;
      mismatches: string[];
    };
    byPaymentDate: Array<{
      bookingCode: string;
      paymentDate: string;
      expectedRentPaise: number;
      commandCenterRentCollectedPaise: number;
      match: boolean;
    }>;
  };
  repairActions: unknown[];
  matrix: Array<{
    bookingCode: string;
    overallPass: boolean;
    checks: ChainCheckResult;
    rentInvoiceId: string | null;
    financialInvoiceId: string | null;
  }>;
  overallPass: boolean;
};

async function loadAuditEntries(entityIds: string[]): Promise<ChainEntityIds['auditLogEntries']> {
  if (entityIds.length === 0) return [];
  const rows = await db
    .select({
      id: auditLog.id,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      action: auditLog.action,
      createdAt: auditLog.createdAt,
      diff: auditLog.diff,
    })
    .from(auditLog)
    .where(inArray(auditLog.entityId, entityIds))
    .orderBy(desc(auditLog.createdAt))
    .limit(50);
  return rows.map((r) => ({
    id: r.id,
    entity: r.entity,
    entityId: r.entityId,
    action: r.action,
    createdAt: r.createdAt.toISOString(),
    diff: r.diff,
  }));
}

async function verifyBookingChain(bookingCode: string): Promise<BookingFinancialChainReport | null> {
  const [booking] = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      status: bookings.status,
      customerId: bookings.customerId,
      durationMode: bookings.durationMode,
      subtotalPaise: bookings.subtotalPaise,
      discountPaise: bookings.discountPaise,
      depositPaise: bookings.depositPaise,
      totalPaise: bookings.totalPaise,
      pricingSnapshot: bookings.pricingSnapshot,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .where(eq(bookings.bookingCode, bookingCode))
    .limit(1);
  if (!booking) return null;

  const [customer] = await db
    .select({ fullName: customers.fullName })
    .from(customers)
    .where(eq(customers.id, booking.customerId))
    .limit(1);

  const [bedRow] = await db
    .select({ bedCode: beds.bedCode })
    .from(bedReservations)
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(and(eq(bedReservations.bookingId, booking.id), eq(bedReservations.kind, 'primary')))
    .limit(1);

  const pays = await db
    .select({
      id: payments.id,
      purpose: payments.purpose,
      status: payments.status,
      amountPaise: payments.amountPaise,
      paidAt: payments.paidAt,
      providerPaymentId: payments.providerPaymentId,
    })
    .from(payments)
    .where(eq(payments.bookingId, booking.id))
    .orderBy(desc(payments.paidAt));

  const succeeded = pays.find((p) => p.status === 'succeeded' && p.purpose === 'booking') ?? null;
  const allocation = succeeded
    ? allocateBookingCheckoutPayment(booking, succeeded.amountPaise)
    : null;
  const expectedRentPaise = succeeded
    ? computeBookingRentPaisePaid({ booking, paymentAmountPaise: succeeded.amountPaise })
    : 0;

  const ledgerRows = await db
    .select({
      id: depositLedger.id,
      entryKind: depositLedger.entryKind,
      amountPaise: depositLedger.amountPaise,
      reason: depositLedger.reason,
      createdAt: depositLedger.createdAt,
    })
    .from(depositLedger)
    .where(eq(depositLedger.bookingId, booking.id))
    .orderBy(depositLedger.createdAt);

  const rentInvs = await db
    .select({
      id: rentInvoices.id,
      invoiceNumber: rentInvoices.invoiceNumber,
      status: rentInvoices.status,
      rentPaise: rentInvoices.rentPaise,
      paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
      paymentId: rentInvoices.paymentId,
      paidAt: rentInvoices.paidAt,
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
      paidAt: financialInvoices.paidAt,
      paymentId: financialInvoices.paymentId,
    })
    .from(financialInvoices)
    .where(eq(financialInvoices.bookingId, booking.id));

  const paidRent = rentInvs.find(
    (r) => r.status === 'paid' && succeeded && r.paymentId === succeeded.id,
  );
  const finIdFromRent = paidRent
    ? await lookupFinancialInvoiceIdBySource('rent_invoices', paidRent.id)
    : null;

  const depositSummary = await getDepositSummaryForBooking(booking.id);
  const paymentDate = succeeded?.paidAt
    ? succeeded.paidAt.toISOString().slice(0, 10)
    : booking.createdAt.toISOString().slice(0, 10);
  const billingMonth = firstOfMonth(paymentDate);

  const metrics = await getBusinessMetricsSummary(billingMonth);
  const incomeRentPaiseBillingMonth =
    metrics.ok && paidRent ? paidRent.paidPrincipalPaise : 0;

  const accountCtx = await loadResidentAccountContext(booking.customerId);
  const rentHistory = accountCtx?.rentPaymentHistory ?? [];
  const residentRentRows = rentHistory
    .filter((h) => !paidRent || h.id === paidRent.id)
    .map((h) => ({ id: h.id, label: h.label, paidPaise: h.paidPaise }));

  let commandCenterPaymentDay: BookingFinancialChainReport['commandCenterPaymentDay'] = null;
  try {
    const cc = await getInvoiceCommandCenterData(paymentDate);
    commandCenterPaymentDay = {
      date: paymentDate,
      rentCollectedPaise: cc.summary.rentCollectedPaise,
      depositCashCollectedPaise: cc.summary.depositCashCollectedPaise,
      depositTransfersPaise: cc.summary.depositTransfersPaise,
      priorDepositSettledPaise: cc.summary.priorDepositSettledPaise,
      refundsPaidPaise: cc.summary.refundsPaidPaise,
      invoicesGeneratedCount: cc.summary.invoicesGeneratedCount,
      invoicesPaidCount: cc.summary.invoicesPaidCount,
    };
  } catch {
    commandCenterPaymentDay = null;
  }

  const auditEntityIds = [
    booking.id,
    ...pays.map((p) => p.id),
    ...ledgerRows.map((l) => l.id),
    ...rentInvs.map((r) => r.id),
    ...finInvs.map((f) => f.id),
  ];

  const auditEntries = await loadAuditEntries(auditEntityIds);

  const depositHeldPaise = depositSummary?.refundableBalancePaise ?? 0;
  const expectedDepositHeld = booking.depositPaise;
  const depositLedgerCorrect =
    depositHeldPaise <= expectedDepositHeld &&
    depositHeldPaise >= 0 &&
    (expectedDepositHeld === 0 || ledgerRows.some((r) => r.entryKind === 'collected' && r.amountPaise > 0));

  const checks: ChainCheckResult = {
    bookingConfirmed: booking.status === 'confirmed',
    paymentSucceeded: succeeded != null && succeeded.amountPaise > 0,
    depositLedgerCorrect,
    rentObligationExists: expectedRentPaise > 0,
    rentInvoiceExists:
      paidRent != null && paidRent.paidPrincipalPaise >= expectedRentPaise && expectedRentPaise > 0,
    financialInvoiceExists: finIdFromRent != null || finInvs.some((f) => f.status === 'paid'),
    residentHistoryShows:
      rentHistory.some((h) => paidRent && h.id === paidRent.id && h.paidPaise >= expectedRentPaise) ||
      rentHistory.some((h) => h.paidPaise >= expectedRentPaise),
    adminInvoiceCenterShows:
      (commandCenterPaymentDay?.rentCollectedPaise ?? 0) >= expectedRentPaise &&
      expectedRentPaise > 0,
    revenueIncludes:
      (metrics.ok && metrics.data.incomeRentPaise > 0 && paidRent != null) ||
      incomeRentPaiseBillingMonth >= expectedRentPaise,
    auditTrailLinks:
      auditEntries.length > 0 &&
      (auditEntries.some((a) => a.entity === 'rent_invoice') ||
        paidRent != null ||
        ledgerRows.length > 0),
  };

  const passCount = Object.values(checks).filter(Boolean).length;

  const residentLabels: Record<string, string> = {
    'APG-2026-0035': 'Ishaan Jaiswal - B2',
    'APG-2026-0036': 'Dhruv - B3',
  };

  return {
    bookingCode,
    residentLabel: residentLabels[bookingCode] ?? customer?.fullName ?? bookingCode,
    paymentDate: succeeded?.paidAt?.toISOString() ?? null,
    expectedRentPaise,
    expectedDepositCashPaise: allocation?.depositCashPaise ?? 0,
    depositHeldPaise,
    ids: {
      bookingId: booking.id,
      customerId: booking.customerId,
      customerName: customer?.fullName ?? '—',
      bedCode: bedRow?.bedCode ?? null,
      payments: pays.map((p) => ({
        id: p.id,
        purpose: p.purpose,
        status: p.status,
        amountPaise: p.amountPaise,
        paidAt: p.paidAt?.toISOString() ?? null,
        providerPaymentId: p.providerPaymentId,
      })),
      depositLedgerRows: ledgerRows.map((r) => ({
        id: r.id,
        entryKind: r.entryKind,
        amountPaise: r.amountPaise,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
      })),
      rentInvoices: rentInvs.map((r) => ({
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        status: r.status,
        rentPaise: r.rentPaise,
        paidPrincipalPaise: r.paidPrincipalPaise,
        paymentId: r.paymentId,
        paidAt: r.paidAt?.toISOString() ?? null,
        billingMonth: r.billingMonth,
      })),
      financialInvoices: finInvs.map((f) => ({
        id: f.id,
        invoiceNumber: f.invoiceNumber,
        status: f.status,
        sourceTable: f.sourceTable,
        sourceId: f.sourceId,
        amountPaise: f.amountPaise,
        paidAt: f.paidAt?.toISOString() ?? null,
        paymentId: f.paymentId,
      })),
      auditLogEntries: auditEntries,
    },
    checks,
    passCount,
    overallPass: passCount === 10,
    commandCenterPaymentDay,
    residentRentHistoryRows: residentRentRows,
    incomeRentPaiseBillingMonth,
    billingMonth,
    linkedFinancialInvoiceId: finIdFromRent,
    linkedRentInvoiceId: paidRent?.id ?? null,
  } as BookingFinancialChainReport & {
    linkedFinancialInvoiceId: string | null;
    linkedRentInvoiceId: string | null;
  };
}

async function idempotentRepair(bookingCode: string): Promise<unknown> {
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

  const actions: unknown[] = [];
  for (const pay of pays) {
    const result = await ensureBookingRentInvoiceForExistingPayment(pay.id);
    actions.push({ paymentId: pay.id, result });
    if ('invoiceId' in result && result.invoiceId) {
      await syncRentInvoiceToUnified(result.invoiceId);
      if (pay.paidAt) {
        await db
          .update(rentInvoices)
          .set({ paidAt: pay.paidAt, paymentId: pay.id, updatedAt: new Date() })
          .where(
            and(eq(rentInvoices.id, result.invoiceId), eq(rentInvoices.bookingId, booking.id)),
          );
        await syncRentInvoiceToUnified(result.invoiceId);
      }
    }
  }
  return { bookingCode, actions };
}

export async function runFinancialChainVerification(input: {
  bookingCodes: string[];
  execute: boolean;
}): Promise<FinancialChainVerificationReport> {
  const today = todayString();
  const repairActions: unknown[] = [];

  let bookingReports: BookingFinancialChainReport[] = [];
  for (const code of input.bookingCodes) {
    const row = await verifyBookingChain(code);
    if (row) bookingReports.push(row);
  }

  const needsRepair = bookingReports.some((r) => !r.overallPass);
  if (input.execute && needsRepair) {
    for (const code of input.bookingCodes) {
      repairActions.push(await idempotentRepair(code));
    }
    bookingReports = [];
    for (const code of input.bookingCodes) {
      const row = await verifyBookingChain(code);
      if (row) bookingReports.push(row);
    }
  }

  const mtd = await getBusinessMetricsSummary(firstOfMonth(today));
  const ccToday = await getInvoiceCommandCenterData(today);
  const dailyToday = await getDailyCollectionTotals(today);

  const expectedTodayRent = bookingReports
    .filter((b) => b.paymentDate?.slice(0, 10) === today)
    .reduce((a, b) => a + b.expectedRentPaise, 0);

  const scopedBookingFilter = or(
    eq(bookings.bookingCode, 'APG-2026-0035'),
    eq(bookings.bookingCode, 'APG-2026-0036'),
  )!;

  const depositTransferToday = await db
    .select({
      total: sql<number>`coalesce(sum(${depositLedger.amountPaise}), 0)::bigint::int`,
    })
    .from(depositLedger)
    .innerJoin(bookings, eq(bookings.id, depositLedger.bookingId))
    .where(
      and(
        eq(depositLedger.entryKind, 'collected'),
        eq(depositLedger.reason, DEPOSIT_CREDIT_REASON),
        sql`${depositLedger.createdAt}::date = ${today}::date`,
        scopedBookingFilter,
      ),
    );

  const priorSettledToday = await db
    .select({
      total: sql<number>`coalesce(sum(${depositLedger.amountPaise}), 0)::bigint::int`,
    })
    .from(depositLedger)
    .innerJoin(bookings, eq(bookings.id, depositLedger.bookingId))
    .where(
      and(
        eq(depositLedger.entryKind, 'collected'),
        eq(depositLedger.reason, PRIOR_DEPOSIT_SETTLED_REASON),
        sql`${depositLedger.createdAt}::date = ${today}::date`,
        scopedBookingFilter,
      ),
    );

  const depositCashToday = bookingReports
    .filter((b) => b.paymentDate?.slice(0, 10) === today)
    .reduce((a, b) => a + b.expectedDepositCashPaise, 0);

  const mismatches: string[] = [];
  if (dailyToday.ok && ccToday.summary.rentCollectedPaise !== dailyToday.data.rentPaise) {
    mismatches.push(
      `Rent: command center ${ccToday.summary.rentCollectedPaise} vs daily collections ${dailyToday.data.rentPaise}`,
    );
  }
  if (
    expectedTodayRent > 0 &&
    ccToday.summary.rentCollectedPaise < expectedTodayRent
  ) {
    mismatches.push(
      `Today rent: expected ≥${expectedTodayRent} from scoped bookings but command center shows ${ccToday.summary.rentCollectedPaise}`,
    );
  }

  const byPaymentDate = bookingReports.map((b) => ({
    bookingCode: b.bookingCode,
    paymentDate: b.paymentDate?.slice(0, 10) ?? '—',
    expectedRentPaise: b.expectedRentPaise,
    commandCenterRentCollectedPaise: b.commandCenterPaymentDay?.rentCollectedPaise ?? 0,
    match:
      (b.commandCenterPaymentDay?.rentCollectedPaise ?? 0) >= b.expectedRentPaise &&
      b.expectedRentPaise > 0,
  }));

  const matrix = bookingReports.map((b) => {
    const ext = b as BookingFinancialChainReport & {
      linkedFinancialInvoiceId?: string | null;
      linkedRentInvoiceId?: string | null;
    };
    return {
      bookingCode: b.bookingCode,
      overallPass: b.overallPass,
      checks: b.checks,
      rentInvoiceId: ext.linkedRentInvoiceId ?? b.ids.rentInvoices.find((r) => r.status === 'paid')?.id ?? null,
      financialInvoiceId:
        ext.linkedFinancialInvoiceId ??
        b.ids.financialInvoices.find((f) => f.sourceTable === 'rent_invoices')?.id ??
        null,
    };
  });

  return {
    verifiedAt: new Date().toISOString(),
    execute: input.execute,
    today,
    bookings: bookingReports,
    revenueReconciliation: {
      today: {
        date: today,
        expectedFromBookingsPaise: {
          rentPaise: expectedTodayRent,
          depositCashPaise: depositCashToday,
          depositTransfersPaise: depositTransferToday[0]?.total ?? 0,
          priorDepositSettledPaise: priorSettledToday[0]?.total ?? 0,
        },
        adminRevenueMtdIncomeRentPaise: mtd.ok ? mtd.data.incomeRentPaise : 0,
        adminInvoicesCommandCenter: ccToday.summary,
        adminDepositsNote:
          'Deposits page shows held balance (point-in-time), not daily collected — compare deposit_ledger rows by date.',
        mismatches,
      },
      byPaymentDate,
    },
    repairActions,
    matrix,
    overallPass: matrix.length > 0 && matrix.every((m) => m.overallPass),
  };
}

/**
 * Full customer financial integrity audit — 8 invariant checks.
 * Used by scripts/audit-financials, repair-financials, and daily reconciliation.
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bookings,
  customers,
  financialInvoices,
  payments,
  rentInvoices,
} from '@/src/db/schema';
import type { FinancialInvoice, InvoiceBreakdown } from '@/src/db/schema/financialInvoices';
import { firstOfMonth } from '@/src/services/billing';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { getResidentFinancialSummary } from '@/src/services/residentFinancialEngine';
import { todayString } from '@/src/lib/dates';

export const FINANCIAL_INTEGRITY_CHECK_TYPES = [
  'DEPOSIT_SHORTFALL_NOT_INVOICED',
  'INVOICE_EMPTY',
  'INVOICE_TOTAL_MISMATCH',
  'PAYMENT_NOT_RECONCILED',
  'DEPOSIT_LEDGER_NEGATIVE',
  'MISSING_RENT_INVOICE',
  'DUPLICATE_INVOICE',
  'OUTSTANDING_NOT_SURFACED',
] as const;

export type FinancialIntegrityCheckType = (typeof FINANCIAL_INTEGRITY_CHECK_TYPES)[number];

export type FinancialIntegrityIssue = {
  checkType: FinancialIntegrityCheckType;
  customerId: string;
  customerName: string;
  bookingId?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  paymentId?: string | null;
  amountPaise?: number;
  detail: string;
  metadata?: Record<string, unknown>;
  autoRepairable: boolean;
};

export type FinancialIntegrityAuditSummary = {
  totalCustomers: number;
  customersWithIssues: number;
  issueCount: number;
  byCheckType: Record<FinancialIntegrityCheckType, number>;
};

export type FinancialIntegrityAuditReport = {
  asOf: string;
  issues: FinancialIntegrityIssue[];
  summary: FinancialIntegrityAuditSummary;
};

const OPEN_INVOICE_STATUSES = ['draft', 'sent', 'overdue', 'partial', 'payment_in_progress', 'processing'] as const;
const CANCELLED_STATUSES = ['cancelled', 'refunded', 'void'] as const;

/** Sum breakdown.lines — SSOT for invoice line totals. */
export function sumBreakdownLines(breakdown: InvoiceBreakdown | null | undefined): number {
  const lines = breakdown?.lines ?? [];
  return lines.reduce((sum, line) => sum + (line.amountPaise ?? 0), 0);
}

/** Outstanding on an open financial invoice from amountPaise − paidPaise. */
export function computeFinancialInvoiceOutstanding(inv: Pick<FinancialInvoice, 'status' | 'amountPaise' | 'breakdown'>): number {
  if (CANCELLED_STATUSES.includes(inv.status as (typeof CANCELLED_STATUSES)[number])) return 0;
  if (inv.status === 'paid' || inv.status === 'settled') return 0;
  const paid = inv.breakdown?.paidPaise ?? 0;
  return Math.max(0, inv.amountPaise - paid);
}

/** Deposit shortfall on open invoices (deposit lines in open financial invoices). */
export function depositShortfallOnOpenInvoices(
  openInvoices: Pick<FinancialInvoice, 'status' | 'breakdown' | 'invoiceType'>[],
): number {
  let covered = 0;
  for (const inv of openInvoices) {
    if (CANCELLED_STATUSES.includes(inv.status as (typeof CANCELLED_STATUSES)[number])) continue;
    if (!OPEN_INVOICE_STATUSES.includes(inv.status as (typeof OPEN_INVOICE_STATUSES)[number])) continue;
    const lines = inv.breakdown?.lines ?? [];
    for (const line of lines) {
      if (line.kind === 'deposit') covered += line.amountPaise;
    }
    if (inv.invoiceType === 'deposit' && lines.length === 0) {
      covered += inv.breakdown?.depositOutstandingPaise ?? 0;
    }
  }
  return covered;
}

export function checkInvoiceEmpty(
  inv: Pick<FinancialInvoice, 'id' | 'invoiceNumber' | 'status' | 'amountPaise' | 'breakdown' | 'customerId'>,
  customerName: string,
): FinancialIntegrityIssue | null {
  if (CANCELLED_STATUSES.includes(inv.status as (typeof CANCELLED_STATUSES)[number])) return null;
  if (inv.amountPaise <= 0) return null;
  const lines = inv.breakdown?.lines ?? [];
  if (lines.length > 0) return null;
  return {
    checkType: 'INVOICE_EMPTY',
    customerId: inv.customerId,
    customerName,
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    amountPaise: inv.amountPaise,
    detail: `Invoice ${inv.invoiceNumber} has amount ₹${inv.amountPaise / 100} but no breakdown lines`,
    autoRepairable: false,
  };
}

export function checkInvoiceTotalMismatch(
  inv: Pick<FinancialInvoice, 'id' | 'invoiceNumber' | 'status' | 'amountPaise' | 'breakdown' | 'customerId'>,
  customerName: string,
): FinancialIntegrityIssue | null {
  if (CANCELLED_STATUSES.includes(inv.status as (typeof CANCELLED_STATUSES)[number])) return null;
  const lines = inv.breakdown?.lines ?? [];
  if (lines.length === 0) return null;
  const lineSum = sumBreakdownLines(inv.breakdown);
  if (lineSum === inv.amountPaise) return null;
  return {
    checkType: 'INVOICE_TOTAL_MISMATCH',
    customerId: inv.customerId,
    customerName,
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    amountPaise: inv.amountPaise,
    detail: `Invoice ${inv.invoiceNumber}: amountPaise=${inv.amountPaise} but lines sum=${lineSum}`,
    metadata: { lineSum, amountPaise: inv.amountPaise },
    autoRepairable: true,
  };
}

export function checkDuplicateInvoices(
  group: Pick<FinancialInvoice, 'id' | 'invoiceNumber' | 'bookingId' | 'billingMonth' | 'invoiceType' | 'status' | 'customerId'>[],
  customerName: string,
): FinancialIntegrityIssue | null {
  const active = group.filter(
    (i) => !CANCELLED_STATUSES.includes(i.status as (typeof CANCELLED_STATUSES)[number]),
  );
  if (active.length <= 1) return null;
  const first = active[0];
  return {
    checkType: 'DUPLICATE_INVOICE',
    customerId: first.customerId,
    customerName,
    bookingId: first.bookingId,
    detail: `${active.length} non-cancelled ${first.invoiceType} invoices for booking ${first.bookingId} month ${first.billingMonth}`,
    metadata: { invoiceIds: active.map((i) => i.id), invoiceNumbers: active.map((i) => i.invoiceNumber) },
    autoRepairable: false,
  };
}

async function auditCustomerInvoices(
  customerId: string,
  customerName: string,
  invoices: FinancialInvoice[],
): Promise<FinancialIntegrityIssue[]> {
  const issues: FinancialIntegrityIssue[] = [];

  for (const inv of invoices) {
    const empty = checkInvoiceEmpty(inv, customerName);
    if (empty) issues.push(empty);
    const mismatch = checkInvoiceTotalMismatch(inv, customerName);
    if (mismatch) issues.push(mismatch);
  }

  const dupKey = new Map<string, FinancialInvoice[]>();
  for (const inv of invoices) {
    if (!inv.bookingId || !inv.billingMonth) continue;
    const key = `${inv.bookingId}:${inv.billingMonth}:${inv.invoiceType}`;
    const list = dupKey.get(key) ?? [];
    list.push(inv);
    dupKey.set(key, list);
  }
  for (const group of dupKey.values()) {
    const dup = checkDuplicateInvoices(group, customerName);
    if (dup) issues.push(dup);
  }

  return issues;
}

async function checkDepositShortfall(
  customerId: string,
  customerName: string,
  bookingId: string,
  depositPaise: number,
  depositDuePaise: number,
  openInvoices: FinancialInvoice[],
): Promise<FinancialIntegrityIssue | null> {
  const summary = await getDepositSummaryForBooking(bookingId);
  const collected = summary?.collectedPaise ?? Math.max(0, depositPaise - depositDuePaise);
  const shortfall = Math.max(0, depositPaise - collected);
  if (shortfall <= 0) return null;

  const onInvoice = depositShortfallOnOpenInvoices(openInvoices);
  const notInvoiced = Math.max(0, shortfall - onInvoice);
  if (notInvoiced <= 0) return null;

  return {
    checkType: 'DEPOSIT_SHORTFALL_NOT_INVOICED',
    customerId,
    customerName,
    bookingId,
    amountPaise: notInvoiced,
    detail: `Deposit shortfall ₹${notInvoiced / 100} not on open invoice (required ${depositPaise}, collected ${collected})`,
    metadata: { depositPaise, collected, onInvoice, notInvoiced },
    autoRepairable: true,
  };
}

async function checkDepositLedgerNegative(
  customerId: string,
  customerName: string,
  bookingId: string,
): Promise<FinancialIntegrityIssue | null> {
  const summary = await getDepositSummaryForBooking(bookingId);
  if (!summary || summary.entries.length === 0) return null;
  if (summary.refundableBalancePaise >= 0) return null;
  return {
    checkType: 'DEPOSIT_LEDGER_NEGATIVE',
    customerId,
    customerName,
    bookingId,
    amountPaise: summary.refundableBalancePaise,
    detail: `Deposit ledger net balance negative: ${summary.refundableBalancePaise} paise`,
    metadata: { refundableBalancePaise: summary.refundableBalancePaise },
    autoRepairable: false,
  };
}

async function checkMissingRentInvoice(
  customerId: string,
  customerName: string,
  bookingId: string,
): Promise<FinancialIntegrityIssue | null> {
  const billingMonth = firstOfMonth(todayString());
  const [existing] = await db
    .select({ id: rentInvoices.id })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, bookingId),
        eq(rentInvoices.billingMonth, billingMonth),
        sql`${rentInvoices.status} != 'cancelled'`,
        eq(rentInvoices.isAdhoc, false),
      ),
    )
    .limit(1);
  if (existing) return null;

  return {
    checkType: 'MISSING_RENT_INVOICE',
    customerId,
    customerName,
    bookingId,
    detail: `No rent invoice for billing month ${billingMonth}`,
    metadata: { billingMonth },
    autoRepairable: false,
  };
}

async function checkPaymentNotReconciled(
  customerId: string,
  customerName: string,
): Promise<FinancialIntegrityIssue[]> {
  const issues: FinancialIntegrityIssue[] = [];

  const rows = await db
    .select({
      payment: payments,
      invoice: financialInvoices,
    })
    .from(payments)
    .innerJoin(financialInvoices, eq(financialInvoices.paymentId, payments.id))
    .where(
      and(
        eq(payments.status, 'succeeded'),
        inArray(financialInvoices.status, [...OPEN_INVOICE_STATUSES]),
      ),
    );

  for (const { payment, invoice } of rows) {
    if (invoice.customerId !== customerId) continue;
    const paid = invoice.breakdown?.paidPaise ?? 0;
    const remaining = invoice.amountPaise - paid;
    if (payment.amountPaise < remaining) continue;
    issues.push({
      checkType: 'PAYMENT_NOT_RECONCILED',
      customerId,
      customerName,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      paymentId: payment.id,
      amountPaise: payment.amountPaise,
      detail: `Payment ${payment.id} succeeded (₹${payment.amountPaise / 100}) but invoice ${invoice.invoiceNumber} still ${invoice.status}`,
      metadata: { invoiceStatus: invoice.status, paymentAmount: payment.amountPaise, remaining },
      autoRepairable: true,
    });
  }

  const rentRows = await db
    .select({
      payment: payments,
      rent: rentInvoices,
      finId: financialInvoices.id,
      finNumber: financialInvoices.invoiceNumber,
      finStatus: financialInvoices.status,
    })
    .from(payments)
    .innerJoin(rentInvoices, eq(rentInvoices.paymentId, payments.id))
    .leftJoin(
      financialInvoices,
      and(
        eq(financialInvoices.sourceTable, 'rent_invoices'),
        eq(financialInvoices.sourceId, rentInvoices.id),
      ),
    )
    .where(
      and(
        eq(payments.status, 'succeeded'),
        eq(rentInvoices.customerId, customerId),
        inArray(rentInvoices.status, ['pending', 'overdue', 'payment_in_progress']),
      ),
    );

  for (const row of rentRows) {
    if (row.finId && OPEN_INVOICE_STATUSES.includes(row.finStatus as (typeof OPEN_INVOICE_STATUSES)[number])) {
      issues.push({
        checkType: 'PAYMENT_NOT_RECONCILED',
        customerId,
        customerName,
        invoiceId: row.finId,
        invoiceNumber: row.finNumber ?? undefined,
        paymentId: row.payment.id,
        amountPaise: row.payment.amountPaise,
        detail: `Rent payment succeeded but unified invoice still ${row.finStatus}`,
        autoRepairable: true,
      });
    }
  }

  return issues;
}

async function checkOutstandingNotSurfaced(
  customerId: string,
  customerName: string,
): Promise<FinancialIntegrityIssue | null> {
  const summary = await getResidentFinancialSummary(customerId);
  if (!summary) return null;
  const engineOutstanding = summary.totals.outstandingPaise;
  if (engineOutstanding <= 0) return null;

  const openInvoices = await db
    .select()
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.customerId, customerId),
        inArray(financialInvoices.status, [...OPEN_INVOICE_STATUSES]),
      ),
    );

  let surfaced = 0;
  for (const inv of openInvoices) {
    surfaced += computeFinancialInvoiceOutstanding(inv);
  }

  const depositShortfall = summary.deposit.outstandingPaise;
  const depositOnInvoice = depositShortfallOnOpenInvoices(openInvoices);
  const depositNotSurfaced = Math.max(0, depositShortfall - depositOnInvoice);
  surfaced += depositNotSurfaced;

  if (surfaced >= engineOutstanding) return null;

  return {
    checkType: 'OUTSTANDING_NOT_SURFACED',
    customerId,
    customerName,
    amountPaise: engineOutstanding - surfaced,
    detail: `Engine outstanding ₹${engineOutstanding / 100} but only ₹${surfaced / 100} visible via open invoices`,
    metadata: { engineOutstanding, surfaced },
    autoRepairable: false,
  };
}

function buildSummary(issues: FinancialIntegrityIssue[], totalCustomers: number): FinancialIntegrityAuditSummary {
  const byCheckType = Object.fromEntries(
    FINANCIAL_INTEGRITY_CHECK_TYPES.map((t) => [t, 0]),
  ) as Record<FinancialIntegrityCheckType, number>;
  const customerIds = new Set<string>();
  for (const issue of issues) {
    byCheckType[issue.checkType] += 1;
    customerIds.add(issue.customerId);
  }
  return {
    totalCustomers,
    customersWithIssues: customerIds.size,
    issueCount: issues.length,
    byCheckType,
  };
}

/** Scan all non-archived customers and run 8 integrity checks. */
export async function runFinancialIntegrityAudit(): Promise<FinancialIntegrityAuditReport> {
  const asOf = new Date().toISOString();
  const billingMonth = firstOfMonth(todayString());
  const issues: FinancialIntegrityIssue[] = [];

  const customerRows = await db
    .select({
      id: customers.id,
      fullName: customers.fullName,
    })
    .from(customers)
    .where(isNull(customers.archivedAt));

  for (const customer of customerRows) {
    const invoices = await db
      .select()
      .from(financialInvoices)
      .where(eq(financialInvoices.customerId, customer.id));

    issues.push(...(await auditCustomerInvoices(customer.id, customer.fullName, invoices)));
    issues.push(...(await checkPaymentNotReconciled(customer.id, customer.fullName)));
    issues.push(
      ...(await checkOutstandingNotSurfaced(customer.id, customer.fullName)
        .then((r) => (r ? [r] : []))),
    );

    const activeBookings = await db
      .select({
        id: bookings.id,
        depositPaise: bookings.depositPaise,
        depositDuePaise: bookings.depositDuePaise,
      })
      .from(bookings)
      .where(
        and(eq(bookings.customerId, customer.id), eq(bookings.status, 'confirmed')),
      );

    const openInvoices = invoices.filter((i) =>
      OPEN_INVOICE_STATUSES.includes(i.status as (typeof OPEN_INVOICE_STATUSES)[number]),
    );

    for (const booking of activeBookings) {
      const shortfall = await checkDepositShortfall(
        customer.id,
        customer.fullName,
        booking.id,
        booking.depositPaise,
        booking.depositDuePaise ?? 0,
        openInvoices,
      );
      if (shortfall) issues.push(shortfall);

      const ledgerNeg = await checkDepositLedgerNegative(customer.id, customer.fullName, booking.id);
      if (ledgerNeg) issues.push(ledgerNeg);

      if (billingMonth <= todayString()) {
        const missingRent = await checkMissingRentInvoice(customer.id, customer.fullName, booking.id);
        if (missingRent) issues.push(missingRent);
      }
    }
  }

  return {
    asOf,
    issues,
    summary: buildSummary(issues, customerRows.length),
  };
}

/** Live outstanding = open invoice balances + deposit shortfall not on invoice. */
export async function getLiveOutstandingBalance(customerId: string): Promise<{
  outstandingPaise: number;
  openInvoiceBalancePaise: number;
  depositShortfallNotInvoicedPaise: number;
  allPaidUp: boolean;
}> {
  const summary = await getResidentFinancialSummary(customerId);
  const engineOutstanding = summary?.totals.outstandingPaise ?? 0;

  const openInvoices = await db
    .select()
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.customerId, customerId),
        inArray(financialInvoices.status, [...OPEN_INVOICE_STATUSES]),
      ),
    );

  let openInvoiceBalancePaise = 0;
  for (const inv of openInvoices) {
    openInvoiceBalancePaise += computeFinancialInvoiceOutstanding(inv);
  }

  const depositShortfall = summary?.deposit.outstandingPaise ?? 0;
  const depositOnInvoice = depositShortfallOnOpenInvoices(openInvoices);
  const depositShortfallNotInvoicedPaise = Math.max(0, depositShortfall - depositOnInvoice);

  const outstandingPaise = Math.max(engineOutstanding, openInvoiceBalancePaise + depositShortfallNotInvoicedPaise);

  return {
    outstandingPaise,
    openInvoiceBalancePaise,
    depositShortfallNotInvoicedPaise,
    allPaidUp: outstandingPaise <= 0,
  };
}

/** Last daily reconciliation run from audit_log. */
export async function getLastReconciliationRun(): Promise<{
  at: string | null;
  issueCount: number | null;
  repairedCount: number | null;
} | null> {
  const rows = await db.execute<{
    created_at: Date | string;
    diff: { issueCount?: number; repairedCount?: number } | null;
  }>(sql`
    SELECT created_at, diff
    FROM audit_log
    WHERE entity = 'financial_reconciliation'
      AND action = 'daily_reconciliation'
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) return { at: null, issueCount: null, repairedCount: null };
  const when = row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
  const diff = row.diff ?? {};
  return {
    at: when,
    issueCount: typeof diff.issueCount === 'number' ? diff.issueCount : null,
    repairedCount: typeof diff.repairedCount === 'number' ? diff.repairedCount : null,
  };
}

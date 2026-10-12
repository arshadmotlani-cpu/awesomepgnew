/**
 * Standalone invoices for non-resident customers (no booking / occupancy).
 * Reuses standard financial_invoices + share link + PDF rendering.
 */

import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { financialInvoices, invoiceAuditEvents, pgs } from '@/src/db/schema';
import type { InvoiceBreakdown } from '@/src/db/schema/financialInvoices';
import { DOCUMENT_ONLY_INVOICE_FOOTER } from '@/src/lib/billing/companyReimbursementCopy';
import { displayRatePerDayPaise } from '@/src/lib/billing/companyReimbursementCopy';
import { createInvoiceShareToken, invoicePublicSharePath } from '@/src/lib/billing/invoiceShareToken';
import { nextFinancialInvoiceNumber } from '@/src/lib/billing/invoiceNumbering.server';
import { formatDate } from '@/src/lib/dates';
import { formatDate as formatDisplayDate } from '@/src/lib/format';
import { getAppUrl } from '@/src/lib/url';
import {
  resolveStandaloneInvoiceContact,
  type ResolveStandaloneInvoiceContactInput,
} from '@/src/services/standaloneInvoiceContact';
import { resolveShantinagarPgId } from '@/src/roomOs/certification/shantinagar/resolvePg';

export const STANDALONE_INVOICE_SOURCE_TABLE = 'standalone_customer_invoices';

export const STANDALONE_UNPAID_STATUS_LABEL = 'Unpaid';

export type CreateStandaloneCustomerInvoiceInput = {
  customer: ResolveStandaloneInvoiceContactInput;
  /** Inclusive stay start (YYYY-MM-DD). */
  stayStart: string;
  /** Inclusive stay end (YYYY-MM-DD). */
  stayEnd: string;
  durationDays: number;
  totalPaise: number;
  /** Line item title — e.g. PG Accommodation — Daily Rent */
  description: string;
  additionalChargesPaise?: number;
  pgId?: string;
  dueDate?: string | null;
  actorId?: string;
};

export type CreateStandaloneCustomerInvoiceResult =
  | {
      ok: true;
      invoiceId: string;
      invoiceNumber: string;
      shareToken: string;
      shareUrl: string;
      pdfPath: string;
      amountPaise: number;
      ratePerDayPaise: number;
      paymentStatus: string;
      customerName: string;
      stayPeriodLabel: string;
      created: boolean;
    }
  | { ok: false; error: string };

export function standaloneAccommodationLineLabel(input: {
  description: string;
  durationDays: number;
  ratePerDayPaise: number;
}): string {
  const dailyInr = (input.ratePerDayPaise / 100).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  });
  return `${input.description.trim()} — ₹${dailyInr}/day × ${input.durationDays} day${
    input.durationDays === 1 ? '' : 's'
  }`;
}

function stayPeriodLabel(stayStart: string, stayEnd: string): string {
  return `${formatDisplayDate(stayStart)} – ${formatDisplayDate(stayEnd)}`;
}

async function findExistingStandaloneInvoice(input: {
  customerId: string;
  stayStart: string;
  stayEnd: string;
  durationDays: number;
  totalPaise: number;
}) {
  const rows = await db
    .select({
      id: financialInvoices.id,
      invoiceNumber: financialInvoices.invoiceNumber,
      shareToken: financialInvoices.shareToken,
      amountPaise: financialInvoices.amountPaise,
      breakdown: financialInvoices.breakdown,
      status: financialInvoices.status,
    })
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.customerId, input.customerId),
        eq(financialInvoices.invoiceType, 'standalone'),
        isNull(financialInvoices.bookingId),
        eq(financialInvoices.sourceTable, STANDALONE_INVOICE_SOURCE_TABLE),
      ),
    );

  return rows.find((row) => {
    const meta = row.breakdown?.documentOnly;
    return (
      row.amountPaise === input.totalPaise &&
      meta?.stayStart === input.stayStart &&
      meta?.stayEnd === input.stayEnd &&
      meta?.durationDays === input.durationDays
    );
  });
}

export async function createStandaloneCustomerInvoice(
  input: CreateStandaloneCustomerInvoiceInput,
): Promise<CreateStandaloneCustomerInvoiceResult> {
  if (input.totalPaise <= 0) {
    return { ok: false, error: 'Total amount must be greater than zero.' };
  }
  if (input.durationDays <= 0) {
    return { ok: false, error: 'Duration must be at least 1 day.' };
  }
  if (!input.stayStart || !input.stayEnd) {
    return { ok: false, error: 'Stay period is required.' };
  }
  const description = input.description.trim();
  if (!description) {
    return { ok: false, error: 'Description is required.' };
  }

  const additionalPaise = Math.max(0, input.additionalChargesPaise ?? 0);
  const accommodationPaise = input.totalPaise - additionalPaise;
  if (accommodationPaise <= 0) {
    return { ok: false, error: 'Accommodation amount must be greater than zero.' };
  }

  const contact = await resolveStandaloneInvoiceContact(input.customer);
  if (!contact.ok) {
    return { ok: false, error: contact.error };
  }

  const existing = await findExistingStandaloneInvoice({
    customerId: contact.customerId,
    stayStart: input.stayStart,
    stayEnd: input.stayEnd,
    durationDays: input.durationDays,
    totalPaise: input.totalPaise,
  });

  const ratePerDayPaise = displayRatePerDayPaise(accommodationPaise, input.durationDays);
  const period = stayPeriodLabel(input.stayStart, input.stayEnd);
  const customerName = input.customer.fullName.trim();

  if (existing) {
    const token = existing.shareToken ?? '';
    return {
      ok: true,
      invoiceId: existing.id,
      invoiceNumber: existing.invoiceNumber,
      shareToken: token,
      shareUrl: token ? `${getAppUrl()}${invoicePublicSharePath(token)}` : '',
      pdfPath: `/api/invoices/${existing.id}/pdf`,
      amountPaise: existing.amountPaise,
      ratePerDayPaise:
        existing.breakdown?.documentOnly?.ratePerDayPaise ?? ratePerDayPaise,
      paymentStatus: existing.breakdown?.documentOnly?.paymentStatusLabel ?? STANDALONE_UNPAID_STATUS_LABEL,
      customerName,
      stayPeriodLabel: period,
      created: false,
    };
  }

  let pgId = input.pgId;
  if (!pgId) {
    const shanti = await resolveShantinagarPgId();
    if (!shanti) {
      return { ok: false, error: 'Could not resolve default PG (Shantinagar).' };
    }
    pgId = shanti.pgId;
  }

  const [pgRow] = await db.select({ id: pgs.id }).from(pgs).where(eq(pgs.id, pgId)).limit(1);
  if (!pgRow) {
    return { ok: false, error: 'PG not found.' };
  }

  const lineLabel = standaloneAccommodationLineLabel({
    description,
    durationDays: input.durationDays,
    ratePerDayPaise,
  });

  const lines: InvoiceBreakdown['lines'] = [
    {
      kind: 'standalone_accommodation',
      label: lineLabel,
      period,
      amountPaise: accommodationPaise,
    },
  ];
  if (additionalPaise > 0) {
    lines.push({
      kind: 'custom',
      label: 'Additional charges',
      period,
      amountPaise: additionalPaise,
    });
  }

  const breakdown: InvoiceBreakdown = {
    otherPaise: input.totalPaise,
    paidPaise: 0,
    documentOnly: {
      stayStart: input.stayStart,
      stayEnd: input.stayEnd,
      durationDays: input.durationDays,
      ratePerDayPaise,
      paymentStatusLabel: STANDALONE_UNPAID_STATUS_LABEL,
    },
    lines,
  };

  const invoiceNumber = await nextFinancialInvoiceNumber({ pgId });
  const shareToken = createInvoiceShareToken();
  const notes = [
    `${description} · Stay ${period} (${input.durationDays} days). ${STANDALONE_UNPAID_STATUS_LABEL}.`,
    DOCUMENT_ONLY_INVOICE_FOOTER,
  ].join(' ');

  const [row] = await db
    .insert(financialInvoices)
    .values({
      invoiceNumber,
      invoiceType: 'standalone',
      sourceTable: STANDALONE_INVOICE_SOURCE_TABLE,
      sourceId: randomUUID(),
      customerId: contact.customerId,
      bookingId: null,
      pgId,
      bedId: null,
      roomNumber: null,
      bedCode: null,
      amountPaise: input.totalPaise,
      breakdown,
      status: 'sent',
      dueDate: input.dueDate ?? input.stayEnd,
      billingMonth: null,
      sentAt: new Date(),
      notes,
      shareToken,
      isDocumentOnly: false,
      excludeFromReports: false,
      revenueImpact: true,
      analyticsImpact: true,
    })
    .returning({ id: financialInvoices.id });

  await db.insert(invoiceAuditEvents).values({
    invoiceId: row.id,
    action: 'standalone_customer_invoice_created',
    actorType: input.actorId ? 'admin' : 'system',
    actorId: input.actorId ?? null,
    diff: {
      customerName,
      stayStart: input.stayStart,
      stayEnd: input.stayEnd,
      durationDays: input.durationDays,
      totalPaise: input.totalPaise,
      ratePerDayPaise,
      description,
      bookingId: null,
      issuedAt: formatDate(new Date()),
    },
  });

  return {
    ok: true,
    invoiceId: row.id,
    invoiceNumber,
    shareToken,
    shareUrl: `${getAppUrl()}${invoicePublicSharePath(shareToken)}`,
    pdfPath: `/api/invoices/${row.id}/pdf`,
    amountPaise: input.totalPaise,
    ratePerDayPaise,
    paymentStatus: STANDALONE_UNPAID_STATUS_LABEL,
    customerName,
    stayPeriodLabel: period,
    created: true,
  };
}

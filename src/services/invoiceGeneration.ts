/**
 * Invoice generation — all amounts from Resident Financial Engine (SSOT).
 * Never computes rent/deposit/electricity independently.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { financialInvoices } from '@/src/db/schema';
import type { InvoiceBreakdown } from '@/src/db/schema/financialInvoices';
import type { FinancialInvoiceType } from '@/src/db/schema/enums';
import { formatDate } from '@/src/lib/dates';
import { nextFinancialInvoiceNumber } from '@/src/lib/billing/invoiceNumbering.server';
import type { ResidentFinancialLineItem, ResidentFinancialSummary } from '@/src/lib/billing/residentFinancialTypes';
import { getResidentFinancialSummary } from '@/src/services/residentFinancialEngine';
import { createPaymentLinkForInvoice } from '@/src/services/unifiedInvoices';
import { createInvoiceShareToken } from '@/src/lib/billing/invoiceShareToken';

export type GenerateInvoiceKind =
  | 'rent'
  | 'deposit'
  | 'electricity'
  | 'ps4'
  | 'custom'
  | 'combined';

export type GenerateInvoiceInput = {
  customerId: string;
  kind: GenerateInvoiceKind;
  /** SSOT line item ids to include. Omit = all outstanding in category (or all for combined). */
  lineItemIds?: string[];
  /** Custom charge only — label for the line */
  customLabel?: string;
  /** Custom charge only — amount in paise (creates new obligation in financial_invoices) */
  customAmountPaise?: number;
  actorId: string;
  notes?: string;
};

export type GenerateInvoiceResult =
  | {
      ok: true;
      invoiceId: string;
      invoiceNumber: string;
      amountPaise: number;
      paymentUrl?: string;
      whatsappUrl?: string | null;
    }
  | { ok: false; error: string };

function categoryItems(
  summary: ResidentFinancialSummary,
  kind: GenerateInvoiceKind,
): ResidentFinancialLineItem[] {
  switch (kind) {
    case 'rent':
      return summary.rent.items.filter((i) => i.outstandingPaise > 0);
    case 'deposit':
      return summary.deposit.items.filter((i) => i.outstandingPaise > 0);
    case 'electricity':
      return summary.electricity.items.filter((i) => i.outstandingPaise > 0);
    case 'ps4':
      return summary.other.items.filter((i) => i.kind === 'ps4' && i.outstandingPaise > 0);
    case 'custom':
      return summary.other.items.filter((i) => i.kind === 'custom' && i.outstandingPaise > 0);
    case 'combined':
      return [
        ...summary.rent.items,
        ...summary.deposit.items,
        ...summary.electricity.items,
        ...summary.other.items,
      ].filter((i) => i.outstandingPaise > 0);
    default:
      return [];
  }
}

function pickItems(
  items: ResidentFinancialLineItem[],
  lineItemIds?: string[],
): ResidentFinancialLineItem[] {
  if (!lineItemIds?.length) return items;
  const set = new Set(lineItemIds);
  return items.filter((i) => set.has(i.id));
}

function buildBreakdown(items: ResidentFinancialLineItem[]): {
  breakdown: InvoiceBreakdown;
  totalPaise: number;
} {
  const breakdown: InvoiceBreakdown = {
    rentPaise: 0,
    electricityPaise: 0,
    depositPaise: 0,
    ps4Paise: 0,
    otherPaise: 0,
    lines: [],
  };
  let totalPaise = 0;

  for (const item of items) {
    const amt = item.outstandingPaise;
    totalPaise += amt;
    breakdown.lines!.push({
      kind: item.kind,
      label: item.label,
      amountPaise: amt,
      sourceTable: item.sourceTable ?? null,
      sourceId: item.sourceId ?? null,
    });
    if (item.kind === 'rent') breakdown.rentPaise = (breakdown.rentPaise ?? 0) + amt;
    else if (item.kind === 'electricity')
      breakdown.electricityPaise = (breakdown.electricityPaise ?? 0) + amt;
    else if (item.kind === 'deposit') breakdown.depositPaise = (breakdown.depositPaise ?? 0) + amt;
    else if (item.kind === 'ps4') breakdown.ps4Paise = (breakdown.ps4Paise ?? 0) + amt;
    else breakdown.otherPaise = (breakdown.otherPaise ?? 0) + amt;
  }

  return { breakdown, totalPaise };
}

async function nextInvoiceNumber(pgId: string): Promise<string> {
  return nextFinancialInvoiceNumber({ pgId });
}

function mapInvoiceType(kind: GenerateInvoiceKind): FinancialInvoiceType {
  if (kind === 'combined') return 'combined';
  if (kind === 'ps4') return 'ps4';
  if (kind === 'custom') return 'custom';
  return kind;
}

/** Generate invoice from SSOT — single category or combined. */
export async function generateInvoiceFromSsot(
  input: GenerateInvoiceInput,
): Promise<GenerateInvoiceResult> {
  const summary = await getResidentFinancialSummary(input.customerId);
  if (!summary?.bookingId || !summary.pgId) {
    return { ok: false, error: 'No active booking found for this resident.' };
  }

  let items: ResidentFinancialLineItem[] = [];
  let amountPaise = 0;
  let breakdown: InvoiceBreakdown;

  if (input.kind === 'custom' && input.customAmountPaise != null && input.customAmountPaise > 0) {
    amountPaise = input.customAmountPaise;
    breakdown = {
      otherPaise: amountPaise,
      lines: [
        {
          kind: 'custom',
          label: input.customLabel?.trim() || 'Custom charge',
          amountPaise,
        },
      ],
    };
  } else {
    items = pickItems(categoryItems(summary, input.kind), input.lineItemIds);
    if (items.length === 0) {
      return { ok: false, error: 'No outstanding balance in SSOT for this invoice type.' };
    }
    const built = buildBreakdown(items);
    breakdown = built.breakdown;
    amountPaise = built.totalPaise;

    const hasRent = items.some((i) => i.kind === 'rent');
    const hasElectricity = items.some((i) => i.kind === 'electricity');
    if (input.kind === 'combined' && hasRent && hasElectricity) {
      return {
        ok: false,
        error:
          'Rent and electricity must stay on separate invoices — generate one bill per category.',
      };
    }
    if (hasRent && hasElectricity) {
      return {
        ok: false,
        error:
          'Rent and electricity cannot be combined — each needs its own invoice, QR, and payment record.',
      };
    }
  }

  if (amountPaise <= 0) {
    return { ok: false, error: 'Invoice amount must be greater than zero.' };
  }

  if (input.kind === 'combined' && input.lineItemIds?.length) {
    const activeCombined = await db
      .select({ id: financialInvoices.id, breakdown: financialInvoices.breakdown })
      .from(financialInvoices)
      .where(
        and(
          eq(financialInvoices.customerId, summary.customerId),
          eq(financialInvoices.invoiceType, 'combined'),
          inArray(financialInvoices.status, ['sent', 'partial', 'overdue', 'draft']),
        ),
      );
    const newIds = new Set(input.lineItemIds);
    for (const existing of activeCombined) {
      const existingLineIds = (existing.breakdown?.lines ?? [])
        .map((l) => l.sourceId ?? '')
        .filter(Boolean);
      const overlap = existingLineIds.some((id) => newIds.has(id));
      if (overlap) {
        return {
          ok: false,
          error:
            'An active combined invoice already covers one of these lines. Cancel it first or choose different items.',
        };
      }
    }
  }

  const invoiceNumber = await nextInvoiceNumber(summary.pgId);
  const dueDate = formatDate(new Date());
  const invoiceType = mapInvoiceType(input.kind);

  const [row] = await db
    .insert(financialInvoices)
    .values({
      invoiceNumber,
      invoiceType,
      customerId: summary.customerId,
      bookingId: summary.bookingId,
      pgId: summary.pgId,
      bedId: null,
      roomNumber: summary.roomNumber,
      amountPaise,
      breakdown,
      status: 'sent',
      dueDate,
      sentAt: new Date(),
      notes: input.notes ?? null,
      shareToken: createInvoiceShareToken(),
    })
    .returning({ id: financialInvoices.id });

  const linkResult = await createPaymentLinkForInvoice(row.id);
  if (!linkResult.ok) {
    return {
      ok: true,
      invoiceId: row.id,
      invoiceNumber,
      amountPaise,
    };
  }

  return {
    ok: true,
    invoiceId: row.id,
    invoiceNumber,
    amountPaise,
    paymentUrl: linkResult.publicUrl,
    whatsappUrl: linkResult.whatsappShareUrl,
  };
}

/** List unified invoices for a resident with projectInvoice money fields (SSOT). */
export type ResidentInvoiceHistoryRow = {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  customerName: string;
  customerPhone: string;
  pgName: string;
  roomNumber: string | null;
  bedCode: string | null;
  amountPaise: number;
  status: string;
  createdAt: Date;
  dueDate: string | null;
  paidAt: Date | null;
  notes: string | null;
  paidPaise: number;
  outstandingPaise: number;
  lateFeePaise: number;
  billingPeriod: string | null;
  bookingId: string | null;
  bookingCode: string | null;
};

export async function listResidentInvoiceHistory(
  customerId: string,
  limit = 200,
): Promise<ResidentInvoiceHistoryRow[]> {
  const { bookings, electricityInvoices, rentInvoices } = await import('@/src/db/schema');
  const { customers, pgs } = await import('@/src/db/schema');
  const { desc, eq } = await import('drizzle-orm');
  const { parseBillingPeriodFromInvoiceNotes } = await import(
    '@/src/lib/billing/billingCoverageModel'
  );
  const { projectInvoice } = await import('@/src/services/rentInvoices');
  const { projectElectricityInvoice } = await import('@/src/services/electricityBilling');

  const rows = await db
    .select({
      id: financialInvoices.id,
      invoiceNumber: financialInvoices.invoiceNumber,
      invoiceType: financialInvoices.invoiceType,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      pgName: pgs.name,
      roomNumber: financialInvoices.roomNumber,
      bedCode: financialInvoices.bedCode,
      amountPaise: financialInvoices.amountPaise,
      status: financialInvoices.status,
      createdAt: financialInvoices.createdAt,
      dueDate: financialInvoices.dueDate,
      paidAt: financialInvoices.paidAt,
      notes: financialInvoices.notes,
      sourceTable: financialInvoices.sourceTable,
      sourceId: financialInvoices.sourceId,
      bookingId: financialInvoices.bookingId,
      bookingCode: bookings.bookingCode,
    })
    .from(financialInvoices)
    .innerJoin(customers, eq(customers.id, financialInvoices.customerId))
    .innerJoin(pgs, eq(pgs.id, financialInvoices.pgId))
    .leftJoin(bookings, eq(bookings.id, financialInvoices.bookingId))
    .where(eq(financialInvoices.customerId, customerId))
    .orderBy(desc(financialInvoices.createdAt))
    .limit(limit);

  const rentIds = rows
    .filter((r) => r.sourceTable === 'rent_invoices' && r.sourceId)
    .map((r) => r.sourceId!);
  const elecIds = rows
    .filter((r) => r.sourceTable === 'electricity_invoices' && r.sourceId)
    .map((r) => r.sourceId!);

  const [rentRows, elecRows] = await Promise.all([
    rentIds.length > 0
      ? db.select().from(rentInvoices).where(inArray(rentInvoices.id, rentIds))
      : Promise.resolve([]),
    elecIds.length > 0
      ? db.select().from(electricityInvoices).where(inArray(electricityInvoices.id, elecIds))
      : Promise.resolve([]),
  ]);

  const rentById = new Map(rentRows.map((r) => [r.id, r]));
  const elecById = new Map(elecRows.map((r) => [r.id, r]));

  return rows.map((row) => {
    const base = {
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      invoiceType: row.invoiceType,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      pgName: row.pgName,
      roomNumber: row.roomNumber,
      bedCode: row.bedCode,
      amountPaise: row.amountPaise,
      status: row.status,
      createdAt: row.createdAt,
      dueDate: row.dueDate ?? null,
      paidAt: row.paidAt,
      notes: row.notes,
      bookingId: row.bookingId,
      bookingCode: row.bookingCode,
    };

    if (row.sourceTable === 'rent_invoices' && row.sourceId) {
      const ri = rentById.get(row.sourceId);
      if (ri) {
        const projected = projectInvoice(ri);
        const period = parseBillingPeriodFromInvoiceNotes(ri.notes);
        return {
          ...base,
          paidPaise: (ri.paidPrincipalPaise ?? 0) + (ri.paidLateFeePaise ?? 0),
          outstandingPaise: projected.outstandingPaise,
          lateFeePaise: projected.accruedLateFeePaise,
          billingPeriod: period ? `${period.periodStart} → ${period.periodEnd}` : null,
        };
      }
    }

    if (row.sourceTable === 'electricity_invoices' && row.sourceId) {
      const ei = elecById.get(row.sourceId);
      if (ei) {
        const projected = projectElectricityInvoice(ei);
        return {
          ...base,
          paidPaise: ei.paidPaise ?? 0,
          outstandingPaise: projected.outstandingPaise,
          lateFeePaise: projected.accruedLateFeePaise ?? 0,
          billingPeriod: ei.billingMonth ? String(ei.billingMonth).slice(0, 7) : null,
        };
      }
    }

    const paidAtAmount = row.paidAt ? row.amountPaise : 0;
    return {
      ...base,
      paidPaise: paidAtAmount,
      outstandingPaise: row.paidAt ? 0 : row.amountPaise,
      lateFeePaise: 0,
      billingPeriod: null,
    };
  });
}

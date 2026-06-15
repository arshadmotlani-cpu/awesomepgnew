/**
 * Unified invoice registry — single source of truth for billing, collections, and revenue.
 */

import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  beds,
  customers,
  electricityBills,
  electricityInvoices,
  financialInvoices,
  invoiceAuditEvents,
  paymentLinks,
  pgs,
  rentInvoices,
  rooms,
} from '@/src/db/schema';
import type { FinancialInvoice, InvoiceBreakdown } from '@/src/db/schema/financialInvoices';
import type { FinancialInvoiceStatus, FinancialInvoiceType } from '@/src/db/schema/enums';
import { createPaymentLink } from '@/src/services/paymentLinks';
import { buildInvoiceWhatsAppUrl } from '@/src/lib/billing/invoiceWhatsApp';

export const REVENUE_INVOICE_STATUSES = ['paid'] as const;

export type InvoiceListFilters = {
  status?: FinancialInvoiceStatus | 'all' | 'pending';
  search?: string;
  pgId?: string;
  limit?: number;
};

export type InvoiceListRow = {
  id: string;
  invoiceNumber: string;
  invoiceType: FinancialInvoiceType;
  customerName: string;
  customerPhone: string;
  pgName: string;
  roomNumber: string | null;
  bedCode: string | null;
  amountPaise: number;
  status: FinancialInvoiceStatus;
  createdAt: Date;
  dueDate: string | null;
  paidAt: Date | null;
};

async function logInvoiceAudit(
  invoiceId: string,
  action: string,
  diff?: Record<string, unknown>,
  actor?: { type: string; id?: string | null },
) {
  await db.insert(invoiceAuditEvents).values({
    invoiceId,
    action,
    actorType: actor?.type ?? 'system',
    actorId: actor?.id ?? null,
    diff: diff ?? null,
  });
}

async function loadBedContext(bedId: string) {
  const [row] = await db
    .select({ roomNumber: rooms.roomNumber, bedCode: beds.bedCode })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(eq(beds.id, bedId))
    .limit(1);
  return row ?? { roomNumber: null, bedCode: null };
}

function rentStatusToUnified(status: string, dueDate: string): FinancialInvoiceStatus {
  if (status === 'paid') return 'paid';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'overdue') return 'overdue';
  if (dueDate < new Date().toISOString().slice(0, 10)) return 'overdue';
  return 'sent';
}

function elecStatusToUnified(status: string, dueDate: string): FinancialInvoiceStatus {
  if (status === 'paid') return 'paid';
  if (status === 'cancelled') return 'cancelled';
  if (dueDate < new Date().toISOString().slice(0, 10)) return 'overdue';
  return 'sent';
}

export async function syncRentInvoiceToUnified(rentInvoiceId: string): Promise<string | null> {
  const [ri] = await db.select().from(rentInvoices).where(eq(rentInvoices.id, rentInvoiceId)).limit(1);
  if (!ri) return null;

  const ctx = await loadBedContext(ri.bedId);
  const amountPaise = ri.rentPaise + (ri.paidLateFeePaise ?? 0);
  const breakdown: InvoiceBreakdown = {
    rentPaise: ri.rentPaise,
    lateFeePaise: ri.paidLateFeePaise ?? 0,
    lines: [{ kind: 'rent', label: 'Monthly rent', amountPaise: ri.rentPaise }],
  };
  const status = rentStatusToUnified(ri.status, ri.dueDate);

  const [existing] = await db
    .select({ id: financialInvoices.id })
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.sourceTable, 'rent_invoices'),
        eq(financialInvoices.sourceId, rentInvoiceId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(financialInvoices)
      .set({
        amountPaise,
        breakdown,
        status,
        dueDate: ri.dueDate,
        billingMonth: ri.billingMonth,
        paymentId: ri.paymentId,
        paidAt: ri.paidAt,
        cancelledAt: ri.cancelledAt,
        cancellationReason: ri.cancellationReason,
        roomNumber: ctx.roomNumber,
        bedCode: ctx.bedCode,
        updatedAt: new Date(),
      })
      .where(eq(financialInvoices.id, existing.id));
    return existing.id;
  }

  const [row] = await db
    .insert(financialInvoices)
    .values({
      invoiceNumber: ri.invoiceNumber,
      invoiceType: 'rent',
      sourceTable: 'rent_invoices',
      sourceId: ri.id,
      customerId: ri.customerId,
      bookingId: ri.bookingId,
      pgId: ri.pgId,
      bedId: ri.bedId,
      roomNumber: ctx.roomNumber,
      bedCode: ctx.bedCode,
      amountPaise,
      breakdown,
      status,
      dueDate: ri.dueDate,
      billingMonth: ri.billingMonth,
      paymentId: ri.paymentId,
      paidAt: ri.paidAt,
      sentAt: ri.createdAt,
      cancelledAt: ri.cancelledAt,
      cancellationReason: ri.cancellationReason,
      notes: ri.notes,
    })
    .returning({ id: financialInvoices.id });

  await logInvoiceAudit(row.id, 'created', { source: 'rent_invoices', rentInvoiceId });
  return row.id;
}

export async function syncElectricityInvoiceToUnified(
  electricityInvoiceId: string,
): Promise<string | null> {
  const [ei] = await db
    .select()
    .from(electricityInvoices)
    .where(eq(electricityInvoices.id, electricityInvoiceId))
    .limit(1);
  if (!ei) return null;

  const [bill] = await db
    .select({ pgId: electricityBills.pgId })
    .from(electricityBills)
    .where(eq(electricityBills.id, ei.electricityBillId))
    .limit(1);
  if (!bill) return null;

  const ctx = await loadBedContext(ei.bedId);
  const amountPaise = ei.amountPaise + (ei.lateFeeLockedPaise ?? 0);
  const breakdown: InvoiceBreakdown = {
    electricityPaise: ei.amountPaise,
    lateFeePaise: ei.lateFeeLockedPaise ?? 0,
    lines: [{ kind: 'electricity', label: 'Electricity share', amountPaise: ei.amountPaise }],
  };
  const status = elecStatusToUnified(ei.status, ei.dueDate);

  const [existing] = await db
    .select({ id: financialInvoices.id })
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.sourceTable, 'electricity_invoices'),
        eq(financialInvoices.sourceId, electricityInvoiceId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(financialInvoices)
      .set({
        amountPaise,
        breakdown,
        status,
        dueDate: ei.dueDate,
        billingMonth: ei.billingMonth,
        paymentId: ei.paymentId,
        paidAt: ei.paidAt,
        cancelledAt: ei.cancelledAt,
        roomNumber: ctx.roomNumber,
        bedCode: ctx.bedCode,
        pgId: bill.pgId,
        updatedAt: new Date(),
      })
      .where(eq(financialInvoices.id, existing.id));
    return existing.id;
  }

  const [row] = await db
    .insert(financialInvoices)
    .values({
      invoiceNumber: ei.invoiceNumber,
      invoiceType: 'electricity',
      sourceTable: 'electricity_invoices',
      sourceId: ei.id,
      customerId: ei.customerId,
      bookingId: ei.bookingId,
      pgId: bill.pgId,
      bedId: ei.bedId,
      roomNumber: ctx.roomNumber,
      bedCode: ctx.bedCode,
      amountPaise,
      breakdown,
      status,
      dueDate: ei.dueDate,
      billingMonth: ei.billingMonth,
      paymentId: ei.paymentId,
      paidAt: ei.paidAt,
      sentAt: ei.createdAt,
      cancelledAt: ei.cancelledAt,
    })
    .returning({ id: financialInvoices.id });

  await logInvoiceAudit(row.id, 'created', { source: 'electricity_invoices', electricityInvoiceId });
  return row.id;
}

export async function listUnifiedInvoices(
  filters: InvoiceListFilters = {},
): Promise<InvoiceListRow[]> {
  const limit = filters.limit ?? 200;
  let statusFilter: FinancialInvoiceStatus[] | undefined;
  if (filters.status && filters.status !== 'all') {
    statusFilter = filters.status === 'pending' ? ['sent', 'overdue'] : [filters.status];
  }

  const search = filters.search?.trim();

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
    })
    .from(financialInvoices)
    .innerJoin(customers, eq(customers.id, financialInvoices.customerId))
    .innerJoin(pgs, eq(pgs.id, financialInvoices.pgId))
    .where(
      and(
        filters.pgId ? eq(financialInvoices.pgId, filters.pgId) : undefined,
        statusFilter ? inArray(financialInvoices.status, statusFilter) : undefined,
        search
          ? or(
              ilike(customers.fullName, `%${search}%`),
              ilike(customers.phone, `%${search}%`),
              ilike(financialInvoices.invoiceNumber, `%${search}%`),
              ilike(pgs.name, `%${search}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(financialInvoices.createdAt))
    .limit(limit);

  return rows.map((r) => ({ ...r, dueDate: r.dueDate ?? null }));
}

export async function getUnifiedInvoiceDetail(invoiceId: string) {
  const [inv] = await db
    .select({
      invoice: financialInvoices,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      customerEmail: customers.email,
      pgName: pgs.name,
    })
    .from(financialInvoices)
    .innerJoin(customers, eq(customers.id, financialInvoices.customerId))
    .innerJoin(pgs, eq(pgs.id, financialInvoices.pgId))
    .where(eq(financialInvoices.id, invoiceId))
    .limit(1);

  if (!inv) return null;

  const audit = await db
    .select()
    .from(invoiceAuditEvents)
    .where(eq(invoiceAuditEvents.invoiceId, invoiceId))
    .orderBy(desc(invoiceAuditEvents.createdAt));

  const [link] = inv.invoice.paymentLinkId
    ? await db.select().from(paymentLinks).where(eq(paymentLinks.id, inv.invoice.paymentLinkId)).limit(1)
    : [null];

  return {
    ...inv.invoice,
    customerName: inv.customerName,
    customerPhone: inv.customerPhone,
    customerEmail: inv.customerEmail,
    pgName: inv.pgName,
    auditEvents: audit,
    paymentLink: link,
  };
}

export async function cancelUnifiedInvoice(
  invoiceId: string,
  reason: string,
  actor?: { type: string; id?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [inv] = await db
    .select()
    .from(financialInvoices)
    .where(eq(financialInvoices.id, invoiceId))
    .limit(1);
  if (!inv) return { ok: false, error: 'Invoice not found.' };
  if (inv.status === 'cancelled') return { ok: true };
  if (inv.status === 'paid') {
    return { ok: false, error: 'Paid invoices must be refunded, not cancelled.' };
  }

  const before = { status: inv.status, amountPaise: inv.amountPaise };

  await db
    .update(financialInvoices)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
      cancellationReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(financialInvoices.id, invoiceId));

  if (inv.sourceTable === 'rent_invoices' && inv.sourceId) {
    await db
      .update(rentInvoices)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(rentInvoices.id, inv.sourceId));
  }
  if (inv.sourceTable === 'electricity_invoices' && inv.sourceId) {
    await db
      .update(electricityInvoices)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(electricityInvoices.id, inv.sourceId));
  }

  await logInvoiceAudit(invoiceId, 'cancelled', { before, after: { status: 'cancelled', reason } }, actor);
  return { ok: true };
}

export async function refundUnifiedInvoice(
  invoiceId: string,
  reason: string,
  actor?: { type: string; id?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [inv] = await db
    .select()
    .from(financialInvoices)
    .where(eq(financialInvoices.id, invoiceId))
    .limit(1);
  if (!inv) return { ok: false, error: 'Invoice not found.' };
  if (inv.status !== 'paid') return { ok: false, error: 'Only paid invoices can be refunded.' };

  const before = { status: inv.status, amountPaise: inv.amountPaise };

  await db
    .update(financialInvoices)
    .set({
      status: 'refunded',
      refundedAt: new Date(),
      refundReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(financialInvoices.id, invoiceId));

  await logInvoiceAudit(invoiceId, 'refunded', { before, after: { status: 'refunded', reason } }, actor);
  return { ok: true };
}

export async function markUnifiedInvoicePaid(
  invoiceId: string,
  paymentId?: string | null,
  actor?: { type: string; id?: string | null },
) {
  const [inv] = await db
    .select()
    .from(financialInvoices)
    .where(eq(financialInvoices.id, invoiceId))
    .limit(1);
  if (!inv || inv.status === 'cancelled' || inv.status === 'refunded') return;

  await db
    .update(financialInvoices)
    .set({
      status: 'paid',
      paidAt: new Date(),
      paymentId: paymentId ?? inv.paymentId,
      updatedAt: new Date(),
    })
    .where(eq(financialInvoices.id, invoiceId));

  await logInvoiceAudit(invoiceId, 'paid', { paymentId }, actor);
}

export async function createPaymentLinkForInvoice(invoiceId: string) {
  const detail = await getUnifiedInvoiceDetail(invoiceId);
  if (!detail) return { ok: false as const, message: 'Invoice not found.' };

  const purpose =
    detail.invoiceType === 'electricity'
      ? 'electricity'
      : detail.invoiceType === 'deposit'
        ? 'deposit'
        : 'rent';

  const link = await createPaymentLink({
    residentId: detail.customerId,
    pgId: detail.pgId,
    amountPaise: detail.amountPaise,
    purpose,
    residentName: detail.customerName,
    residentPhone: detail.customerPhone,
    pgName: detail.pgName,
    dueDate: detail.dueDate ?? undefined,
    isOverdue: detail.status === 'overdue',
  });

  if (!link.ok) return link;

  const linkId = link.link.id;
  await db.update(paymentLinks).set({ invoiceId }).where(eq(paymentLinks.id, linkId));
  await db
    .update(financialInvoices)
    .set({ paymentLinkId: linkId, updatedAt: new Date() })
    .where(eq(financialInvoices.id, invoiceId));

  await logInvoiceAudit(invoiceId, 'payment_link_created', { linkId });

  const whatsappShareUrl = buildInvoiceWhatsAppUrl({
    customerName: detail.customerName,
    customerPhone: detail.customerPhone,
    invoiceNumber: detail.invoiceNumber,
    amountPaise: detail.amountPaise,
    paymentLinkUrl: link.publicUrl,
  });

  return {
    ok: true as const,
    publicUrl: link.publicUrl,
    whatsappShareUrl,
    linkId,
  };
}

export async function syncManyToUnified(
  ids: string[],
  kind: 'rent' | 'electricity',
): Promise<void> {
  for (const id of ids) {
    if (kind === 'rent') await syncRentInvoiceToUnified(id);
    else await syncElectricityInvoiceToUnified(id);
  }
}

export async function getInvoiceStats() {
  const rows = await db.execute(sql`
    SELECT
      'paid_rent' AS bucket,
      count(*)::int AS cnt,
      coalesce(sum(ri.paid_principal_paise + ri.paid_late_fee_paise), 0)::bigint::int AS paise
    FROM rent_invoices ri
    WHERE ri.status = 'paid'
    UNION ALL
    SELECT
      'pending_rent' AS bucket,
      count(*)::int,
      coalesce(sum(ri.rent_paise), 0)::bigint::int
    FROM rent_invoices ri
    WHERE ri.status IN ('pending', 'overdue')
    UNION ALL
    SELECT
      'cancelled_rent' AS bucket,
      count(*)::int,
      coalesce(sum(ri.rent_paise), 0)::bigint::int
    FROM rent_invoices ri
    WHERE ri.status = 'cancelled'
    UNION ALL
    SELECT
      'paid_elec' AS bucket,
      count(*)::int,
      coalesce(sum(ei.paid_paise + coalesce(ei.late_fee_locked_paise, 0)), 0)::bigint::int
    FROM electricity_invoices ei
    WHERE ei.status = 'paid'
    UNION ALL
    SELECT
      'pending_elec' AS bucket,
      count(*)::int,
      coalesce(sum(ei.amount_paise), 0)::bigint::int
    FROM electricity_invoices ei
    WHERE ei.status = 'pending'
  `);

  const list = (rows as unknown as Array<{ bucket: string; cnt: number; paise: number }>) ?? [];
  const by = new Map(list.map((r) => [r.bucket, r]));

  const paidRent = by.get('paid_rent') ?? { cnt: 0, paise: 0 };
  const pendingRent = by.get('pending_rent') ?? { cnt: 0, paise: 0 };
  const cancelledRent = by.get('cancelled_rent') ?? { cnt: 0, paise: 0 };
  const paidElec = by.get('paid_elec') ?? { cnt: 0, paise: 0 };
  const pendingElec = by.get('pending_elec') ?? { cnt: 0, paise: 0 };

  return {
    paidCount: paidRent.cnt + paidElec.cnt,
    paidPaise: paidRent.paise + paidElec.paise,
    pendingCount: pendingRent.cnt + pendingElec.cnt,
    pendingPaise: pendingRent.paise + pendingElec.paise,
    overdueCount: 0,
    cancelledCount: cancelledRent.cnt,
    refundedCount: 0,
    netRevenuePaise: paidRent.paise + paidElec.paise,
  };
}

export async function getInvoiceRevenueSummary(billingMonth: string) {
  const rows = await db.execute(sql`
    SELECT
      fi.invoice_type AS invoice_type,
      COALESCE(SUM(fi.amount_paise) FILTER (WHERE fi.status = 'paid'), 0)::bigint AS paid_paise,
      COALESCE(SUM(fi.amount_paise) FILTER (WHERE fi.status = 'cancelled'), 0)::bigint AS cancelled_paise,
      COALESCE(SUM(fi.amount_paise) FILTER (WHERE fi.status = 'refunded'), 0)::bigint AS refunded_paise
    FROM financial_invoices fi
    WHERE fi.billing_month = ${billingMonth}::date
    GROUP BY fi.invoice_type
  `);

  const list =
    (rows as unknown as Array<{
      invoice_type: string;
      paid_paise: number;
      cancelled_paise: number;
      refunded_paise: number;
    }>) ?? [];

  let rentPaise = 0;
  let electricityPaise = 0;
  let depositPaise = 0;
  let ps4Paise = 0;
  let otherPaise = 0;

  for (const row of list) {
    const net = Number(row.paid_paise) - Number(row.cancelled_paise) - Number(row.refunded_paise);
    if (row.invoice_type === 'rent') rentPaise += net;
    else if (row.invoice_type === 'electricity') electricityPaise += net;
    else if (row.invoice_type === 'deposit') depositPaise += net;
    else if (row.invoice_type === 'ps4') ps4Paise += net;
    else otherPaise += net;
  }

  return {
    rentPaise,
    electricityPaise,
    depositPaise,
    ps4Paise,
    otherPaise,
    totalPaise: rentPaise + electricityPaise + depositPaise + ps4Paise + otherPaise,
  };
}

import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhPurchaseAuditEvents,
  fyhPurchaseReturns,
  fyhPurchases,
  fyhVendorNotes,
  fyhVendorPayables,
  fyhVendorPaymentAllocations,
  fyhVendorPayments,
  fyhVendors,
} from '@/src/hair/db/schema';
import { getVendorOutstanding } from '@/src/hair/services/purchaseBrain';
import { getVendorUnallocatedAdvance } from '@/src/hair/services/vendorPaymentEngine';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';

export type VendorDashboard = {
  outstandingPaise: number;
  advanceBalancePaise: number;
  totalPurchasesPaise: number;
  totalPaymentsPaise: number;
  totalReturnsPaise: number;
  lastPurchase: { purchaseNumber: string; purchaseDate: string } | null;
  avgPaymentDelayDays: number | null;
};

export type VendorStatementLineType = 'opening' | 'purchase' | 'payment' | 'return';

export type VendorStatementLine = {
  date: string;
  type: VendorStatementLineType;
  reference: string;
  debitPaise: number;
  creditPaise: number;
  balancePaise: number;
};

export type VendorStatement = {
  vendor: typeof fyhVendors.$inferSelect;
  from: string;
  to: string;
  openingBalancePaise: number;
  closingBalancePaise: number;
  periodTotals: {
    purchasesPaise: number;
    paymentsPaise: number;
    returnsPaise: number;
  };
  lines: VendorStatementLine[];
};

export type VendorTimelineEventType =
  | 'purchase_recorded'
  | 'payment_recorded'
  | 'payment_reversed'
  | 'return_recorded'
  | 'purchase_edited'
  | 'note_added';

export type VendorTimelineEvent = {
  id: string;
  type: VendorTimelineEventType;
  occurredAt: Date;
  title: string;
  subtitle?: string;
  amountPaise?: number;
  reference?: string;
  staffName?: string;
  href?: string;
};

export function defaultStatementDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export async function getVendorDashboard(vendorId: string, ctx?: TenantContext | null): Promise<VendorDashboard | null> {
  const [vendor] = await hairDb
    .select()
    .from(fyhVendors)
    .where(and(orgFilter(fyhVendors.organizationId, ctx), eq(fyhVendors.id, vendorId)))
    .limit(1);
  if (!vendor) return null;

  const [purchaseRow] = await hairDb
    .select({
      total: sql<number>`coalesce(sum(${fyhPurchases.totalPaise}), 0)`,
    })
    .from(fyhPurchases)
    .where(and(eq(fyhPurchases.vendorId, vendorId), eq(fyhPurchases.status, 'posted')));

  const [paymentRow] = await hairDb
    .select({
      total: sql<number>`coalesce(sum(${fyhVendorPayments.amountPaise}), 0)`,
    })
    .from(fyhVendorPayments)
    .where(and(eq(fyhVendorPayments.vendorId, vendorId), eq(fyhVendorPayments.status, 'active')));

  const [returnRow] = await hairDb
    .select({
      total: sql<number>`coalesce(sum(${fyhPurchaseReturns.creditPaise}), 0)`,
    })
    .from(fyhPurchaseReturns)
    .where(and(orgFilter(fyhPurchaseReturns.organizationId, ctx), locationFilter(fyhPurchaseReturns.locationId, ctx), eq(fyhPurchaseReturns.vendorId, vendorId)));

  const [lastPurchase] = await hairDb
    .select({
      purchaseNumber: fyhPurchases.purchaseNumber,
      purchaseDate: fyhPurchases.purchaseDate,
    })
    .from(fyhPurchases)
    .where(and(eq(fyhPurchases.vendorId, vendorId), eq(fyhPurchases.status, 'posted')))
    .orderBy(desc(fyhPurchases.purchaseDate), desc(fyhPurchases.createdAt))
    .limit(1);

  const allocationRows = await hairDb
    .select({
      paymentDate: fyhVendorPayments.paymentDate,
      purchaseDate: fyhPurchases.purchaseDate,
    })
    .from(fyhVendorPaymentAllocations)
    .innerJoin(
      fyhVendorPayments,
      eq(fyhVendorPayments.id, fyhVendorPaymentAllocations.paymentId),
    )
    .innerJoin(fyhVendorPayables, eq(fyhVendorPayables.id, fyhVendorPaymentAllocations.payableId))
    .innerJoin(fyhPurchases, eq(fyhPurchases.id, fyhVendorPayables.purchaseId))
    .where(
      and(eq(fyhVendorPayables.vendorId, vendorId), eq(fyhVendorPayments.status, 'active')),
    );

  let delaySum = 0;
  for (const row of allocationRows) {
    const pay = new Date(row.paymentDate).getTime();
    const pur = new Date(row.purchaseDate).getTime();
    delaySum += Math.max(0, Math.round((pay - pur) / 86_400_000));
  }
  const avgPaymentDelayDays = allocationRows.length
    ? Math.round(delaySum / allocationRows.length)
    : null;

  return {
    outstandingPaise: await getVendorOutstanding(vendorId),
    advanceBalancePaise: await getVendorUnallocatedAdvance(vendorId),
    totalPurchasesPaise: Number(purchaseRow?.total ?? 0),
    totalPaymentsPaise: Number(paymentRow?.total ?? 0),
    totalReturnsPaise: Number(returnRow?.total ?? 0),
    lastPurchase: lastPurchase
      ? { purchaseNumber: lastPurchase.purchaseNumber, purchaseDate: lastPurchase.purchaseDate }
      : null,
    avgPaymentDelayDays,
  };
}

async function sumOpeningBalance(vendorId: string, beforeDate: string): Promise<number> {
  const purchaseDebit = await hairDb
    .select({
      total: sql<number>`coalesce(sum(${fyhVendorPayables.amountPaise}), 0)`,
    })
    .from(fyhVendorPayables)
    .innerJoin(fyhPurchases, eq(fyhPurchases.id, fyhVendorPayables.purchaseId))
    .where(
      and(eq(fyhVendorPayables.vendorId, vendorId), sql`${fyhPurchases.purchaseDate} < ${beforeDate}`),
    );

  const paymentCredit = await hairDb
    .select({
      total: sql<number>`coalesce(sum(${fyhVendorPaymentAllocations.amountPaise}), 0)`,
    })
    .from(fyhVendorPaymentAllocations)
    .innerJoin(
      fyhVendorPayments,
      eq(fyhVendorPayments.id, fyhVendorPaymentAllocations.paymentId),
    )
    .innerJoin(fyhVendorPayables, eq(fyhVendorPayables.id, fyhVendorPaymentAllocations.payableId))
    .where(
      and(
        eq(fyhVendorPayables.vendorId, vendorId),
        eq(fyhVendorPayments.status, 'active'),
        sql`${fyhVendorPayments.paymentDate} < ${beforeDate}`,
      ),
    );

  const returnCredit = await hairDb
    .select({
      total: sql<number>`coalesce(sum(${fyhPurchaseReturns.creditPaise}), 0)`,
    })
    .from(fyhPurchaseReturns)
    .where(
      and(
        eq(fyhPurchaseReturns.vendorId, vendorId),
        sql`${fyhPurchaseReturns.returnDate} < ${beforeDate}`,
      ),
    );

  return (
    Number(purchaseDebit[0]?.total ?? 0) -
    Number(paymentCredit[0]?.total ?? 0) -
    Number(returnCredit[0]?.total ?? 0)
  );
}

export async function getVendorStatement(
  vendorId: string,
  period: { from: string; to: string }, ctx?: TenantContext | null): Promise<VendorStatement | null> {
  const [vendor] = await hairDb
    .select()
    .from(fyhVendors)
    .where(and(orgFilter(fyhVendors.organizationId, ctx), eq(fyhVendors.id, vendorId)))
    .limit(1);
  if (!vendor) return null;

  const openingBalancePaise = await sumOpeningBalance(vendorId, period.from);
  let running = openingBalancePaise;

  const lines: VendorStatementLine[] = [
    {
      date: period.from,
      type: 'opening',
      reference: 'Opening balance',
      debitPaise: 0,
      creditPaise: 0,
      balancePaise: running,
    },
  ];

  type RawLine = {
    sortKey: string;
    date: string;
    type: VendorStatementLineType;
    reference: string;
    debitPaise: number;
    creditPaise: number;
  };

  const raw: RawLine[] = [];

  const purchases = await hairDb
    .select({
      purchaseDate: fyhPurchases.purchaseDate,
      purchaseNumber: fyhPurchases.purchaseNumber,
      vendorInvoiceRef: fyhPurchases.vendorInvoiceRef,
      amountPaise: fyhVendorPayables.amountPaise,
    })
    .from(fyhVendorPayables)
    .innerJoin(fyhPurchases, eq(fyhPurchases.id, fyhVendorPayables.purchaseId))
    .where(
      and(
        eq(fyhVendorPayables.vendorId, vendorId),
        gte(fyhPurchases.purchaseDate, period.from),
        lte(fyhPurchases.purchaseDate, period.to),
      ),
    );

  for (const p of purchases) {
    raw.push({
      sortKey: `${p.purchaseDate}T00:purchase:${p.purchaseNumber}`,
      date: p.purchaseDate,
      type: 'purchase',
      reference: p.vendorInvoiceRef?.trim() || p.purchaseNumber,
      debitPaise: p.amountPaise,
      creditPaise: 0,
    });
  }

  const allocations = await hairDb
    .select({
      paymentDate: fyhVendorPayments.paymentDate,
      paymentNumber: fyhVendorPayments.paymentNumber,
      amountPaise: fyhVendorPaymentAllocations.amountPaise,
    })
    .from(fyhVendorPaymentAllocations)
    .innerJoin(
      fyhVendorPayments,
      eq(fyhVendorPayments.id, fyhVendorPaymentAllocations.paymentId),
    )
    .innerJoin(fyhVendorPayables, eq(fyhVendorPayables.id, fyhVendorPaymentAllocations.payableId))
    .where(
      and(
        eq(fyhVendorPayables.vendorId, vendorId),
        eq(fyhVendorPayments.status, 'active'),
        gte(fyhVendorPayments.paymentDate, period.from),
        lte(fyhVendorPayments.paymentDate, period.to),
      ),
    );

  for (const a of allocations) {
    raw.push({
      sortKey: `${a.paymentDate}T01:payment:${a.paymentNumber}`,
      date: a.paymentDate,
      type: 'payment',
      reference: a.paymentNumber,
      debitPaise: 0,
      creditPaise: a.amountPaise,
    });
  }

  const returns = await hairDb
    .select({
      returnDate: fyhPurchaseReturns.returnDate,
      creditPaise: fyhPurchaseReturns.creditPaise,
      purchaseNumber: fyhPurchases.purchaseNumber,
    })
    .from(fyhPurchaseReturns)
    .innerJoin(fyhPurchases, eq(fyhPurchases.id, fyhPurchaseReturns.purchaseId))
    .where(
      and(
        eq(fyhPurchaseReturns.vendorId, vendorId),
        gte(fyhPurchaseReturns.returnDate, period.from),
        lte(fyhPurchaseReturns.returnDate, period.to),
      ),
    );

  for (const r of returns) {
    raw.push({
      sortKey: `${r.returnDate}T02:return:${r.purchaseNumber}`,
      date: r.returnDate,
      type: 'return',
      reference: `Return — ${r.purchaseNumber}`,
      debitPaise: 0,
      creditPaise: r.creditPaise,
    });
  }

  raw.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  let purchasesPaise = 0;
  let paymentsPaise = 0;
  let returnsPaise = 0;

  for (const row of raw) {
    running += row.debitPaise - row.creditPaise;
    if (row.type === 'purchase') purchasesPaise += row.debitPaise;
    if (row.type === 'payment') paymentsPaise += row.creditPaise;
    if (row.type === 'return') returnsPaise += row.creditPaise;
    lines.push({
      date: row.date,
      type: row.type,
      reference: row.reference,
      debitPaise: row.debitPaise,
      creditPaise: row.creditPaise,
      balancePaise: running,
    });
  }

  return {
    vendor,
    from: period.from,
    to: period.to,
    openingBalancePaise,
    closingBalancePaise: running,
    periodTotals: { purchasesPaise, paymentsPaise, returnsPaise },
    lines,
  };
}

export async function getVendorActivityTimeline(
  vendorId: string,
  limit = 100, ctx?: TenantContext | null): Promise<VendorTimelineEvent[]> {
  const events: VendorTimelineEvent[] = [];

  const purchases = await hairDb
    .select()
    .from(fyhPurchases)
    .where(and(orgFilter(fyhPurchases.organizationId, ctx), locationFilter(fyhPurchases.locationId, ctx), eq(fyhPurchases.vendorId, vendorId)))
    .orderBy(desc(fyhPurchases.createdAt))
    .limit(limit);

  for (const p of purchases) {
    events.push({
      id: `purchase:${p.id}`,
      type: 'purchase_recorded',
      occurredAt: p.createdAt,
      title: 'Purchase recorded',
      subtitle: p.vendorInvoiceRef?.trim() || p.purchaseNumber,
      amountPaise: p.totalPaise,
      reference: p.purchaseNumber,
      staffName: p.staffName,
      href: `/purchases/${p.id}`,
    });
  }

  const payments = await hairDb
    .select()
    .from(fyhVendorPayments)
    .where(and(orgFilter(fyhVendorPayments.organizationId, ctx), eq(fyhVendorPayments.vendorId, vendorId)))
    .orderBy(desc(fyhVendorPayments.createdAt))
    .limit(limit);

  for (const p of payments) {
    events.push({
      id: `payment:${p.id}`,
      type: p.status === 'reversed' ? 'payment_reversed' : 'payment_recorded',
      occurredAt: p.reversedAt ?? p.createdAt,
      title: p.status === 'reversed' ? 'Payment reversed' : 'Payment recorded',
      subtitle: p.paymentNumber,
      amountPaise: p.amountPaise,
      reference: p.reference ?? undefined,
      staffName: p.status === 'reversed' ? p.reversedByStaffName ?? p.staffName : p.staffName,
      href: `/vendors/${vendorId}`,
    });
  }

  const returns = await hairDb
    .select({
      purchaseReturn: fyhPurchaseReturns,
      purchaseNumber: fyhPurchases.purchaseNumber,
    })
    .from(fyhPurchaseReturns)
    .innerJoin(fyhPurchases, eq(fyhPurchases.id, fyhPurchaseReturns.purchaseId))
    .where(and(orgFilter(fyhPurchaseReturns.organizationId, ctx), locationFilter(fyhPurchaseReturns.locationId, ctx), eq(fyhPurchaseReturns.vendorId, vendorId)))
    .orderBy(desc(fyhPurchaseReturns.createdAt))
    .limit(limit);

  for (const { purchaseReturn: r, purchaseNumber } of returns) {
    events.push({
      id: `return:${r.id}`,
      type: 'return_recorded',
      occurredAt: r.createdAt,
      title: 'Purchase return',
      subtitle: purchaseNumber,
      amountPaise: r.creditPaise,
      staffName: r.staffName,
      href: `/purchases/${r.purchaseId}`,
    });
  }

  const audits = await hairDb
    .select({
      audit: fyhPurchaseAuditEvents,
      purchaseNumber: fyhPurchases.purchaseNumber,
    })
    .from(fyhPurchaseAuditEvents)
    .innerJoin(fyhPurchases, eq(fyhPurchases.id, fyhPurchaseAuditEvents.purchaseId))
    .where(and(orgFilter(fyhPurchases.organizationId, ctx), locationFilter(fyhPurchases.locationId, ctx), eq(fyhPurchases.vendorId, vendorId)))
    .orderBy(desc(fyhPurchaseAuditEvents.createdAt))
    .limit(limit);

  for (const { audit, purchaseNumber } of audits) {
    events.push({
      id: `audit:${audit.id}`,
      type: 'purchase_edited',
      occurredAt: audit.createdAt,
      title: 'Purchase edited',
      subtitle: purchaseNumber,
      staffName: audit.staffName,
      href: `/purchases/${audit.purchaseId}`,
    });
  }

  const notes = await hairDb
    .select()
    .from(fyhVendorNotes)
    .where(and(orgFilter(fyhVendorNotes.organizationId, ctx), locationFilter(fyhVendorNotes.locationId, ctx), eq(fyhVendorNotes.vendorId, vendorId)))
    .orderBy(desc(fyhVendorNotes.createdAt))
    .limit(limit);

  for (const n of notes) {
    events.push({
      id: `note:${n.id}`,
      type: 'note_added',
      occurredAt: n.createdAt,
      title: 'Note added',
      subtitle: n.note,
      staffName: n.staffName,
      href: `/vendors/${vendorId}`,
    });
  }

  events.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  return events.slice(0, limit);
}

export async function addVendorNote(input: {
  vendorId: string;
  note: string;
  staffName: string;
  staffEmployeeId?: string | null;
}) {
  const note = input.note.trim();
  if (!note) throw new Error('Note cannot be empty');

  const [row] = await hairDb
    .insert(fyhVendorNotes)
    .values({
      vendorId: input.vendorId,
      note,
      staffName: input.staffName.trim(),
      staffEmployeeId: input.staffEmployeeId ?? null,
    })
    .returning();
  return row!;
}

export async function listPurchaseAuditEvents(purchaseId: string, ctx?: TenantContext | null) {
  return hairDb
    .select()
    .from(fyhPurchaseAuditEvents)
    .where(and(orgFilter(fyhPurchaseAuditEvents.organizationId, ctx), locationFilter(fyhPurchaseAuditEvents.locationId, ctx), eq(fyhPurchaseAuditEvents.purchaseId, purchaseId)))
    .orderBy(desc(fyhPurchaseAuditEvents.createdAt));
}

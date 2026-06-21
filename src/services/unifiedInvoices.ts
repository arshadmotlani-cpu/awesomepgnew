/**
 * Unified invoice registry — single source of truth for billing, collections, and revenue.
 */

import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  beds,
  bookings,
  customers,
  depositLedger,
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
import {
  FINANCIAL_CANCELLABLE_STATUSES,
  isFinancialInvoiceCancellable,
  isRentInvoiceCancellable,
  logInvoiceStateTransition,
  mergeFinancialStatusFromRent,
  rentStatusToUnifiedStatus,
} from '@/src/lib/billing/invoiceStateMachine';

export const REVENUE_INVOICE_STATUSES = ['paid'] as const;

export type InvoiceListFilters = {
  status?: FinancialInvoiceStatus | 'all' | 'pending';
  search?: string;
  pgId?: string;
  customerId?: string;
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
  notes: string | null;
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
  return rentStatusToUnifiedStatus(status, dueDate);
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
  const rentLabel =
    ri.isAdhoc && ri.notes ? ri.notes.split(' — ')[0] : 'Monthly rent';
  const breakdown: InvoiceBreakdown = {
    rentPaise: ri.rentPaise,
    lateFeePaise: ri.paidLateFeePaise ?? 0,
    lines: [{ kind: 'rent', label: rentLabel, amountPaise: ri.rentPaise }],
  };

  const [existing] = await db
    .select({ id: financialInvoices.id, status: financialInvoices.status })
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.sourceTable, 'rent_invoices'),
        eq(financialInvoices.sourceId, rentInvoiceId),
      ),
    )
    .limit(1);

  const status = mergeFinancialStatusFromRent(
    existing?.status,
    ri.status,
    ri.dueDate,
    Boolean(ri.paymentProofUrl),
  );

  if (existing) {
    if (existing.status !== status) {
      logInvoiceStateTransition({
        invoiceId: existing.id,
        layer: 'financial',
        previousStatus: existing.status,
        newStatus: status,
        source: 'system',
        meta: { rentInvoiceId, trigger: 'syncRentInvoiceToUnified' },
      });
    }
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

/** Attach deposit collected + booking context to express walk-in unified invoices. */
export async function enrichExpressWalkInUnifiedBreakdown(
  bookingId: string,
  financialInvoiceId: string,
): Promise<void> {
  const [booking] = await db
    .select({
      depositPaise: bookings.depositPaise,
      depositDuePaise: bookings.depositDuePaise,
      notes: bookings.notes,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking) return;

  const [collected] = await db
    .select({
      total: sql<number>`coalesce(sum(${depositLedger.amountPaise}), 0)::bigint::int`,
    })
    .from(depositLedger)
    .where(and(eq(depositLedger.bookingId, bookingId), eq(depositLedger.entryKind, 'collected')));

  const depositCollectedPaise = Number(collected?.total ?? 0);
  const depositOutstandingPaise = Math.max(0, booking.depositDuePaise ?? 0);

  const [inv] = await db
    .select({ breakdown: financialInvoices.breakdown, amountPaise: financialInvoices.amountPaise })
    .from(financialInvoices)
    .where(eq(financialInvoices.id, financialInvoiceId))
    .limit(1);
  if (!inv) return;

  const breakdown: InvoiceBreakdown = {
    ...(inv.breakdown ?? {}),
    rentPaise: inv.breakdown?.rentPaise ?? inv.amountPaise,
    depositPaise: depositCollectedPaise,
    depositRequiredPaise: booking.depositPaise,
    depositOutstandingPaise,
    paidPaise: (inv.breakdown?.rentPaise ?? inv.amountPaise) + depositCollectedPaise,
    lines: [
      ...(inv.breakdown?.lines ?? [{ kind: 'rent', label: 'Rent', amountPaise: inv.amountPaise }]),
      ...(depositCollectedPaise > 0
        ? [{ kind: 'deposit' as const, label: 'Deposit collected', amountPaise: depositCollectedPaise }]
        : []),
    ],
  };

  await db
    .update(financialInvoices)
    .set({ breakdown, notes: booking.notes, updatedAt: new Date() })
    .where(eq(financialInvoices.id, financialInvoiceId));
}

export async function requireRentUnifiedInvoice(bookingId: string): Promise<string> {
  const [rent] = await db
    .select({ id: rentInvoices.id })
    .from(rentInvoices)
    .where(eq(rentInvoices.bookingId, bookingId))
    .limit(1);
  if (!rent) {
    throw new Error('Rent invoice missing after express collection.');
  }
  const unifiedId = await syncRentInvoiceToUnified(rent.id);
  if (!unifiedId) {
    throw new Error('Unified invoice sync failed.');
  }
  await enrichExpressWalkInUnifiedBreakdown(bookingId, unifiedId);
  return unifiedId;
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
    statusFilter =
      filters.status === 'pending'
        ? ['sent', 'overdue', 'partial']
        : [filters.status];
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
      notes: financialInvoices.notes,
    })
    .from(financialInvoices)
    .innerJoin(customers, eq(customers.id, financialInvoices.customerId))
    .innerJoin(pgs, eq(pgs.id, financialInvoices.pgId))
    .where(
      and(
        filters.pgId ? eq(financialInvoices.pgId, filters.pgId) : undefined,
        filters.customerId ? eq(financialInvoices.customerId, filters.customerId) : undefined,
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
): Promise<
  | {
      ok: true;
      audit: {
        beforeOutstandingPaise: number;
        afterOutstandingPaise: number;
        differencePaise: number;
        cascadedSources: string[];
      };
    }
  | { ok: false; error: string }
> {
  const { getResidentFinancialSummary } = await import('@/src/services/residentFinancialEngine');
  const transitionSource =
    actor?.type === 'admin' ? ('admin' as const) : ('user' as const);

  const txResult = await db.transaction(async (tx) => {
    const [inv] = await tx
      .select()
      .from(financialInvoices)
      .where(eq(financialInvoices.id, invoiceId))
      .for('update')
      .limit(1);

    if (!inv) return { ok: false as const, error: 'Invoice not found.' };
    if (inv.status === 'cancelled') {
      return { ok: true as const, alreadyCancelled: true as const, inv, cascadedSources: [] as string[] };
    }
    if (!isFinancialInvoiceCancellable(inv.status)) {
      return {
        ok: false as const,
        error: `Cannot cancel invoice in status "${inv.status}". Only pending or expired invoices can be cancelled.`,
      };
    }

    const [updated] = await tx
      .update(financialInvoices)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financialInvoices.id, invoiceId),
          inArray(financialInvoices.status, [...FINANCIAL_CANCELLABLE_STATUSES]),
        ),
      )
      .returning({ id: financialInvoices.id });

    if (!updated) {
      return {
        ok: false as const,
        error: 'Invoice state changed during cancellation — payment may be in progress.',
      };
    }

    logInvoiceStateTransition({
      invoiceId,
      layer: 'financial',
      previousStatus: inv.status,
      newStatus: 'cancelled',
      source: transitionSource,
      meta: { reason },
    });

    const cascadedSources: string[] = [];

    if (inv.paymentLinkId) {
      await tx
        .update(paymentLinks)
        .set({ status: 'expired' })
        .where(and(eq(paymentLinks.id, inv.paymentLinkId), eq(paymentLinks.status, 'active')));
    }

    const lines = inv.breakdown?.lines ?? [];
    const isCombined = inv.invoiceType === 'combined' || lines.length > 1;

    const cancelRent = async (rentId: string) => {
      const [rentRow] = await tx
        .select({ status: rentInvoices.status })
        .from(rentInvoices)
        .where(eq(rentInvoices.id, rentId))
        .for('update')
        .limit(1);
      if (!rentRow || !isRentInvoiceCancellable(rentRow.status)) return;

      const [rentUpdated] = await tx
        .update(rentInvoices)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: reason,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(rentInvoices.id, rentId),
            inArray(rentInvoices.status, ['pending', 'overdue', 'expired']),
          ),
        )
        .returning({ id: rentInvoices.id });

      if (rentUpdated) {
        logInvoiceStateTransition({
          invoiceId: rentId,
          layer: 'rent',
          previousStatus: rentRow.status,
          newStatus: 'cancelled',
          source: transitionSource,
          meta: { reason, parentFinancialInvoiceId: invoiceId },
        });
        cascadedSources.push(`cancel:rent:${rentId}`);
      }
    };

    if (isCombined || lines.length > 0) {
      for (const line of lines) {
        if (line.sourceTable === 'rent_invoices' && line.sourceId) {
          await cancelRent(line.sourceId);
        }
        if (line.sourceTable === 'electricity_invoices' && line.sourceId) {
          await tx
            .update(electricityInvoices)
            .set({
              status: 'cancelled',
              cancelledAt: new Date(),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(electricityInvoices.id, line.sourceId),
                inArray(electricityInvoices.status, ['pending']),
              ),
            );
          cascadedSources.push(`cancel:electricity:${line.sourceId}`);
        }
        if (
          line.sourceTable === 'financial_invoices' &&
          line.sourceId &&
          line.sourceId !== inv.id
        ) {
          const [nestedUpdated] = await tx
            .update(financialInvoices)
            .set({
              status: 'cancelled',
              cancelledAt: new Date(),
              cancellationReason: `Cancelled with parent ${inv.invoiceNumber}`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(financialInvoices.id, line.sourceId),
                inArray(financialInvoices.status, [...FINANCIAL_CANCELLABLE_STATUSES]),
              ),
            )
            .returning({ id: financialInvoices.id });
          if (nestedUpdated) {
            cascadedSources.push(`cancel:custom:${line.sourceId}`);
          }
        }
      }
    } else {
      if (inv.sourceTable === 'rent_invoices' && inv.sourceId) {
        await cancelRent(inv.sourceId);
      }
      if (inv.sourceTable === 'electricity_invoices' && inv.sourceId) {
        await tx
          .update(electricityInvoices)
          .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(electricityInvoices.id, inv.sourceId),
              inArray(electricityInvoices.status, ['pending']),
            ),
          );
        cascadedSources.push(`cancel:electricity:${inv.sourceId}`);
      }
    }

    return { ok: true as const, alreadyCancelled: false as const, inv, cascadedSources };
  });

  if (!txResult.ok) return txResult;

  const beforeSummary = await getResidentFinancialSummary(txResult.inv.customerId);
  const beforeOutstanding = beforeSummary?.totals.outstandingPaise ?? 0;

  if (txResult.alreadyCancelled) {
    return {
      ok: true,
      audit: {
        beforeOutstandingPaise: 0,
        afterOutstandingPaise: 0,
        differencePaise: 0,
        cascadedSources: [],
      },
    };
  }

  const before = {
    status: txResult.inv.status,
    amountPaise: txResult.inv.amountPaise,
    outstandingPaise: beforeOutstanding,
  };

  const { reconcileStaleFinancialInvoices } = await import('@/src/lib/billing/financialMetrics');
  await reconcileStaleFinancialInvoices();
  const { resolveStaleBillingActionItems } = await import('@/src/services/actionItems');
  await resolveStaleBillingActionItems().catch(() => undefined);

  const afterSummary = await getResidentFinancialSummary(txResult.inv.customerId);
  const afterOutstanding = afterSummary?.totals.outstandingPaise ?? 0;

  await logInvoiceAudit(
    invoiceId,
    'cancelled',
    {
      before,
      after: { status: 'cancelled', reason, outstandingPaise: afterOutstanding },
      differencePaise: afterOutstanding - beforeOutstanding,
      cascadedSources: txResult.cascadedSources,
    },
    actor,
  );

  const { reverseBookingEffectsIfInvoiceVoided } = await import(
    '@/src/services/invoiceLifecycleReversal'
  );
  await reverseBookingEffectsIfInvoiceVoided({
    invoiceId,
    bookingId: txResult.inv.bookingId,
    customerId: txResult.inv.customerId,
    reason,
    actorId: actor?.id ?? null,
  }).catch((err) => {
    console.error('[cancelUnifiedInvoice] booking reversal failed', err);
  });

  const { revalidateFinancialViews } = await import('@/src/lib/billing/revalidateFinancialViews');
  revalidateFinancialViews();

  return {
    ok: true,
    audit: {
      beforeOutstandingPaise: beforeOutstanding,
      afterOutstandingPaise: afterOutstanding,
      differencePaise: afterOutstanding - beforeOutstanding,
      cascadedSources: txResult.cascadedSources,
    },
  };
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
  if (inv.status !== 'paid' && inv.status !== 'partial') {
    return { ok: false, error: 'Only paid or partial invoices can be refunded.' };
  }

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

  const { reverseInvoicePaymentAllocation } = await import('@/src/services/invoicePayment');
  await reverseInvoicePaymentAllocation(inv);

  await logInvoiceAudit(invoiceId, 'refunded', { before, after: { status: 'refunded', reason } }, actor);
  return { ok: true };
}

export async function markUnifiedInvoicePaid(
  invoiceId: string,
  paymentId?: string | null,
  actor?: { type: string; id?: string | null },
) {
  const result = await db.transaction(async (tx) => {
    const [inv] = await tx
      .select()
      .from(financialInvoices)
      .where(eq(financialInvoices.id, invoiceId))
      .for('update')
      .limit(1);
    if (!inv || inv.status === 'cancelled' || inv.status === 'refunded' || inv.status === 'paid') {
      return null;
    }

    const [updated] = await tx
      .update(financialInvoices)
      .set({
        status: 'paid',
        paidAt: new Date(),
        paymentId: paymentId ?? inv.paymentId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financialInvoices.id, invoiceId),
          inArray(financialInvoices.status, [
            'draft',
            'sent',
            'overdue',
            'payment_in_progress',
            'processing',
            'partial',
          ]),
        ),
      )
      .returning({ id: financialInvoices.id });

    if (!updated) return null;
    return { previousStatus: inv.status };
  });

  if (!result) return;

  logInvoiceStateTransition({
    invoiceId,
    layer: 'financial',
    previousStatus: result.previousStatus,
    newStatus: 'paid',
    source: actor?.type === 'admin' ? 'admin' : 'webhook',
    meta: { paymentId },
  });

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
        : detail.invoiceType === 'combined'
          ? 'combined'
          : 'rent';

  const rentComponent = detail.breakdown?.rentPaise ?? 0;
  const depositComponent = detail.breakdown?.depositPaise ?? 0;

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
    rentComponentPaise: rentComponent > 0 ? rentComponent : undefined,
    depositComponentPaise: depositComponent > 0 ? depositComponent : undefined,
    invoiceNumber: detail.invoiceNumber,
    invoiceBreakdown: detail.breakdown ?? undefined,
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
    breakdown: detail.breakdown ?? undefined,
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
      status,
      count(*)::int AS cnt,
      coalesce(sum(amount_paise), 0)::bigint::int AS paise
    FROM financial_invoices
    GROUP BY status
  `);

  const list = (rows as unknown as Array<{ status: string; cnt: number; paise: number }>) ?? [];
  const by = new Map(list.map((r) => [r.status, r]));

  const paid = by.get('paid') ?? { cnt: 0, paise: 0 };
  const partial = by.get('partial') ?? { cnt: 0, paise: 0 };
  const sent = by.get('sent') ?? { cnt: 0, paise: 0 };
  const overdue = by.get('overdue') ?? { cnt: 0, paise: 0 };
  const cancelled = by.get('cancelled') ?? { cnt: 0, paise: 0 };
  const refunded = by.get('refunded') ?? { cnt: 0, paise: 0 };

  return {
    paidCount: paid.cnt + partial.cnt,
    paidPaise: paid.paise,
    pendingCount: sent.cnt,
    pendingPaise: sent.paise,
    overdueCount: overdue.cnt,
    cancelledCount: cancelled.cnt,
    refundedCount: refunded.cnt,
    netRevenuePaise: paid.paise,
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

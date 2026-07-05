/**
 * Transactional financial_invoices mirror updates — must run in the same DB
 * transaction as source invoice + payment writes (billing integrity SSOT).
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  beds,
  electricityBills,
  electricityInvoices,
  financialInvoices,
  invoiceAuditEvents,
  rentInvoices,
  rooms,
} from '@/src/db/schema';
import type { InvoiceBreakdown } from '@/src/db/schema/financialInvoices';
import type { FinancialInvoiceStatus } from '@/src/db/schema/enums';
import { createInvoiceShareToken } from '@/src/lib/billing/invoiceShareToken';
import {
  logInvoiceStateTransition,
  mergeFinancialStatusFromRent,
  rentStatusToUnifiedStatus,
} from '@/src/lib/billing/invoiceStateMachine';
import { computeRentDuePaise } from '@/src/services/rentInvoices';

export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function loadBedContextInTx(tx: DbTx, bedId: string) {
  const [row] = await tx
    .select({ roomNumber: rooms.roomNumber, bedCode: beds.bedCode })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(eq(beds.id, bedId))
    .limit(1);
  return row ?? { roomNumber: null, bedCode: null };
}

function elecStatusToUnified(status: string, dueDate: string): FinancialInvoiceStatus {
  if (status === 'paid') return 'paid';
  if (status === 'cancelled') return 'cancelled';
  if (dueDate < new Date().toISOString().slice(0, 10)) return 'overdue';
  return 'sent';
}

async function logInvoiceAuditInTx(
  tx: DbTx,
  invoiceId: string,
  action: string,
  diff?: Record<string, unknown>,
) {
  await tx.insert(invoiceAuditEvents).values({
    invoiceId,
    action,
    actorType: 'system',
    actorId: null,
    diff: diff ?? null,
  });
}

export async function syncRentInvoiceToUnifiedInTx(
  tx: DbTx,
  rentInvoiceId: string,
): Promise<string | null> {
  const [ri] = await tx
    .select()
    .from(rentInvoices)
    .where(eq(rentInvoices.id, rentInvoiceId))
    .limit(1);
  if (!ri) return null;

  const ctx = await loadBedContextInTx(tx, ri.bedId);
  const discountPaise = ri.discountPaise ?? 0;
  const rentDuePaise = computeRentDuePaise(ri.rentPaise, discountPaise);
  const amountPaise = rentDuePaise + (ri.paidLateFeePaise ?? 0);
  const rentLabel = ri.isAdhoc && ri.notes ? ri.notes.split(' — ')[0] : 'Monthly rent';
  const breakdown: InvoiceBreakdown = {
    rentPaise: ri.rentPaise,
    discountPaise: discountPaise > 0 ? discountPaise : undefined,
    promoCode: ri.promoCode ?? undefined,
    lateFeePaise: ri.paidLateFeePaise ?? 0,
    lines: [
      { kind: 'rent', label: rentLabel, amountPaise: ri.rentPaise },
      ...(discountPaise > 0
        ? [
            {
              kind: 'discount' as const,
              label: ri.promoCode ? `Promo ${ri.promoCode}` : 'Discount',
              amountPaise: -discountPaise,
            },
          ]
        : []),
    ],
  };

  const [existing] = await tx
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
        meta: { rentInvoiceId, trigger: 'syncRentInvoiceToUnifiedInTx' },
      });
    }
    await tx
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

  const [row] = await tx
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
      shareToken: createInvoiceShareToken(),
    })
    .returning({ id: financialInvoices.id });

  await logInvoiceAuditInTx(tx, row.id, 'created', {
    source: 'rent_invoices',
    rentInvoiceId,
    trigger: 'syncRentInvoiceToUnifiedInTx',
  });
  return row.id;
}

export async function syncElectricityInvoiceToUnifiedInTx(
  tx: DbTx,
  electricityInvoiceId: string,
): Promise<string | null> {
  const [ei] = await tx
    .select()
    .from(electricityInvoices)
    .where(eq(electricityInvoices.id, electricityInvoiceId))
    .limit(1);
  if (!ei) return null;

  const [bill] = await tx
    .select({
      pgId: electricityBills.pgId,
      calculationBreakdown: electricityBills.calculationBreakdown,
    })
    .from(electricityBills)
    .where(eq(electricityBills.id, ei.electricityBillId))
    .limit(1);
  if (!bill) return null;

  const ctx = await loadBedContextInTx(tx, ei.bedId);
  const amountPaise = ei.amountPaise + (ei.lateFeeLockedPaise ?? 0);

  const { breakdownToInvoiceLines } = await import(
    '@/src/lib/billing/buildElectricityBillBreakdown'
  );
  // Read cached breakdown via `tx` only — never call loadElectricityBillBreakdown() here.
  // That helper uses the global `db` pool; on Vercel (pool max 1) it deadlocks inside this transaction.
  const roomBreakdown = bill.calculationBreakdown;
  const detailLines = roomBreakdown
    ? breakdownToInvoiceLines(
        roomBreakdown as import('@/src/lib/billing/electricityBillBreakdownTypes').ElectricityBillCalculationBreakdown,
        ei.customerId,
      )
    : [{ kind: 'electricity' as const, label: 'Electricity share', amountPaise: ei.amountPaise }];

  const breakdown: InvoiceBreakdown = {
    electricityPaise: ei.amountPaise,
    lateFeePaise: ei.lateFeeLockedPaise ?? 0,
    lines: detailLines.map((l) => ({
      kind: l.kind,
      label: l.label,
      amountPaise: l.amountPaise,
      sourceTable: 'electricity_invoices',
      sourceId: electricityInvoiceId,
    })),
  };
  const status = elecStatusToUnified(ei.status, ei.dueDate);

  const [existing] = await tx
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
    await tx
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

  const [row] = await tx
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
      shareToken: createInvoiceShareToken(),
    })
    .returning({ id: financialInvoices.id });

  await logInvoiceAuditInTx(tx, row.id, 'created', {
    source: 'electricity_invoices',
    electricityInvoiceId,
    trigger: 'syncElectricityInvoiceToUnifiedInTx',
  });
  return row.id;
}

export type BillingSettlementEventInput = {
  purpose: 'electricity' | 'rent' | 'deposit' | 'extension' | 'booking';
  sourceTable: string;
  sourceInvoiceId: string;
  paymentId: string;
  unifiedInvoiceId: string | null;
  providerPaymentId: string;
  amountPaise: number;
};

/** Durable reconciliation event — emitted in the same transaction as settlement. */
export async function recordBillingSettlementEventInTx(
  tx: DbTx,
  input: BillingSettlementEventInput,
): Promise<void> {
  if (!input.unifiedInvoiceId) return;
  await tx.insert(invoiceAuditEvents).values({
    invoiceId: input.unifiedInvoiceId,
    action: 'billing_settlement_committed',
    actorType: 'system',
    actorId: null,
    diff: {
      purpose: input.purpose,
      sourceTable: input.sourceTable,
      sourceInvoiceId: input.sourceInvoiceId,
      paymentId: input.paymentId,
      providerPaymentId: input.providerPaymentId,
      amountPaise: input.amountPaise,
    },
  });
}

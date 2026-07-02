/**
 * Admin cash settlement — mark any due financial invoice paid at reception.
 * Same downstream sync as QR/UPI approval; paymentMode = cash, no review queue.
 */

import { randomUUID } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  adminUsers,
  auditLog,
  customers,
  electricityInvoices,
  financialInvoices,
  rentInvoices,
} from '@/src/db/schema';
import type { FinancialInvoiceStatus } from '@/src/db/schema/enums';
import { revalidateAdminSurfaces } from '@/src/lib/admin/revalidateSurfaces';
import { adminCanAccessPg, adminHasPermission, type AdminRole } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { fetchElectricityInvoiceById } from '@/src/lib/db/electricityInvoiceSelect';
import { computeElectricityInvoiceOutstandingPaise } from '@/src/services/residentFinancialEngine';
import { allocateInvoicePayment } from '@/src/services/invoicePayment';
import { projectInvoice } from '@/src/services/rentInvoices';
import { syncActionItems } from '@/src/services/actionItems';
import { getUnifiedInvoiceDetail } from '@/src/services/unifiedInvoices';

const PAYABLE_STATUSES = new Set<FinancialInvoiceStatus>([
  'draft',
  'sent',
  'overdue',
  'partial',
  'payment_in_progress',
  'processing',
]);

export async function resolveFinancialInvoiceIdForSource(input: {
  sourceTable: 'rent_invoices' | 'electricity_invoices';
  sourceId: string;
}): Promise<string | null> {
  const [row] = await db
    .select({ id: financialInvoices.id })
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.sourceTable, input.sourceTable),
        eq(financialInvoices.sourceId, input.sourceId),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

export async function resolveFinancialInvoiceIdMap(
  sources: Array<{ sourceTable: 'rent_invoices' | 'electricity_invoices'; sourceId: string }>,
): Promise<Map<string, string>> {
  if (sources.length === 0) return new Map();

  const rentIds = sources.filter((s) => s.sourceTable === 'rent_invoices').map((s) => s.sourceId);
  const elecIds = sources
    .filter((s) => s.sourceTable === 'electricity_invoices')
    .map((s) => s.sourceId);

  const rows: Array<{ id: string; sourceTable: string; sourceId: string }> = [];

  if (rentIds.length > 0) {
    const rentRows = await db
      .select({
        id: financialInvoices.id,
        sourceTable: financialInvoices.sourceTable,
        sourceId: financialInvoices.sourceId,
      })
      .from(financialInvoices)
      .where(
        and(
          eq(financialInvoices.sourceTable, 'rent_invoices'),
          inArray(financialInvoices.sourceId, rentIds),
        ),
      );
    rows.push(
      ...rentRows
        .filter((r) => r.sourceId)
        .map((r) => ({
          id: r.id,
          sourceTable: 'rent_invoices' as const,
          sourceId: r.sourceId!,
        })),
    );
  }

  if (elecIds.length > 0) {
    const elecRows = await db
      .select({
        id: financialInvoices.id,
        sourceTable: financialInvoices.sourceTable,
        sourceId: financialInvoices.sourceId,
      })
      .from(financialInvoices)
      .where(
        and(
          eq(financialInvoices.sourceTable, 'electricity_invoices'),
          inArray(financialInvoices.sourceId, elecIds),
        ),
      );
    rows.push(
      ...elecRows
        .filter((r) => r.sourceId)
        .map((r) => ({
          id: r.id,
          sourceTable: 'electricity_invoices' as const,
          sourceId: r.sourceId!,
        })),
    );
  }

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(`${row.sourceTable}:${row.sourceId}`, row.id);
  }
  return map;
}

export function canAdminMarkInvoicePaidWithCash(role: AdminRole): boolean {
  return (
    role === 'super_admin' ||
    role === 'pg_manager' ||
    adminHasPermission(role, 'payments:write')
  );
}

export type CashSettlementEligibility = {
  financialInvoiceId: string;
  invoiceNumber: string;
  residentName: string;
  invoiceType: string;
  amountPaise: number;
  balanceDuePaise: number;
  status: FinancialInvoiceStatus;
  pgId: string;
  canSettle: boolean;
  blockReason?: string;
};

function outstandingPaiseForFinancialInvoice(input: {
  amountPaise: number;
  status: FinancialInvoiceStatus;
  breakdownPaidPaise?: number | null;
}): number {
  if (input.status === 'paid' || input.status === 'cancelled' || input.status === 'refunded') {
    return 0;
  }
  const paid = input.breakdownPaidPaise ?? 0;
  if (paid > 0) return Math.max(0, input.amountPaise - paid);
  return input.amountPaise;
}

export async function getCashSettlementEligibility(
  session: AdminSession,
  financialInvoiceId: string,
): Promise<CashSettlementEligibility | null> {
  if (!canAdminMarkInvoicePaidWithCash(session.role)) {
    return null;
  }

  const base = await getUnifiedInvoiceDetail(financialInvoiceId);
  if (!base) return null;

  if (!adminCanAccessPg(session, base.pgId)) {
    return null;
  }

  const [customer] = await db
    .select({ fullName: customers.fullName })
    .from(customers)
    .where(eq(customers.id, base.customerId))
    .limit(1);

  let balanceDuePaise = outstandingPaiseForFinancialInvoice({
    amountPaise: base.amountPaise,
    status: base.status,
    breakdownPaidPaise: base.breakdown?.paidPaise,
  });

  if (base.sourceTable === 'rent_invoices' && base.sourceId) {
    const [ri] = await db.select().from(rentInvoices).where(eq(rentInvoices.id, base.sourceId)).limit(1);
    if (ri) balanceDuePaise = projectInvoice(ri).outstandingPaise;
  } else if (base.sourceTable === 'electricity_invoices' && base.sourceId) {
    const ei = await fetchElectricityInvoiceById(base.sourceId);
    if (ei) balanceDuePaise = computeElectricityInvoiceOutstandingPaise(ei);
  }

  let blockReason: string | undefined;
  if (!PAYABLE_STATUSES.has(base.status)) {
    blockReason = `Invoice status is ${base.status.replace(/_/g, ' ')} — not collectible.`;
  } else if (balanceDuePaise <= 0) {
    blockReason = 'Nothing due on this invoice.';
  }

  return {
    financialInvoiceId: base.id,
    invoiceNumber: base.invoiceNumber,
    residentName: customer?.fullName ?? 'Resident',
    invoiceType: base.invoiceType,
    amountPaise: base.amountPaise,
    balanceDuePaise,
    status: base.status,
    pgId: base.pgId,
    canSettle: !blockReason,
    blockReason,
  };
}

async function writeCashSettlementAudit(input: {
  session: AdminSession;
  financialInvoiceId: string;
  invoiceNumber: string;
  amountPaise: number;
  paymentId: string | null;
  notes?: string;
  receivedAt: Date;
}) {
  const [admin] = await db
    .select({ fullName: adminUsers.fullName, email: adminUsers.email })
    .from(adminUsers)
    .where(eq(adminUsers.id, input.session.adminId))
    .limit(1);

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.session.adminId,
    entity: 'financial_invoice',
    entityId: input.financialInvoiceId,
    action: 'mark_paid_cash',
    diff: {
      invoiceNumber: input.invoiceNumber,
      amountPaise: input.amountPaise,
      paymentMode: 'cash',
      paymentId: input.paymentId,
      receivedByAdminId: input.session.adminId,
      receivedByAdminName: admin?.fullName ?? admin?.email ?? 'Admin',
      receivedAt: input.receivedAt.toISOString(),
      notes: input.notes?.trim() || null,
    },
  });
}

export async function markFinancialInvoicePaidWithCash(
  session: AdminSession,
  input: {
    financialInvoiceId: string;
    notes?: string;
    receivedAt?: string;
  },
): Promise<{ ok: true; paymentId: string | null } | { ok: false; error: string }> {
  if (!canAdminMarkInvoicePaidWithCash(session.role)) {
    return { ok: false, error: 'You are not authorized to record cash collections.' };
  }

  const eligibility = await getCashSettlementEligibility(session, input.financialInvoiceId);
  if (!eligibility) return { ok: false, error: 'Invoice not found.' };
  if (!eligibility.canSettle) {
    return { ok: false, error: eligibility.blockReason ?? 'Invoice cannot be settled.' };
  }

  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
  if (Number.isNaN(receivedAt.getTime())) {
    return { ok: false, error: 'Invalid received date.' };
  }

  const base = await getUnifiedInvoiceDetail(input.financialInvoiceId);
  if (!base) return { ok: false, error: 'Invoice not found.' };

  const amountPaise = eligibility.balanceDuePaise;
  const providerPaymentId = `cash-admin-${input.financialInvoiceId}-${randomUUID()}`;

  const [admin] = await db
    .select({ fullName: adminUsers.fullName, email: adminUsers.email })
    .from(adminUsers)
    .where(eq(adminUsers.id, session.adminId))
    .limit(1);

  const rawPayload = {
    source: 'admin_cash_settlement',
    paymentMode: 'cash',
    collectedByAdminId: session.adminId,
    receivedByAdminName: admin?.fullName ?? admin?.email ?? 'Admin',
    notes: input.notes?.trim() || null,
    receivedAt: receivedAt.toISOString(),
  };

  let paymentId: string | null = null;

  if (base.sourceTable === 'rent_invoices' && base.sourceId) {
    const [ri] = await db.select().from(rentInvoices).where(eq(rentInvoices.id, base.sourceId)).limit(1);
    if (!ri) return { ok: false, error: 'Rent invoice source missing.' };

    if (ri.paymentProofUrl) {
      await db
        .update(rentInvoices)
        .set({ paymentProofUrl: null, updatedAt: new Date() })
        .where(eq(rentInvoices.id, base.sourceId));
    }

    const { applyApprovedPaymentAtomic } = await import('@/src/services/paymentSettlementAtomic');
    const result = await applyApprovedPaymentAtomic({
      purpose: 'rent',
      provider: 'mock',
      offlineProvider: 'cash',
      providerPaymentId,
      amountPaise,
      invoiceId: base.sourceId,
      paidAt: receivedAt,
      rawPayload,
    });
    if (!result.ok) return { ok: false, error: result.reason };
    paymentId = result.paymentId;
  } else if (base.sourceTable === 'electricity_invoices' && base.sourceId) {
    if (base.sourceId) {
      await db
        .update(electricityInvoices)
        .set({ paymentProofUrl: null, updatedAt: new Date() })
        .where(eq(electricityInvoices.id, base.sourceId));
    }

    const { applyApprovedPaymentAtomic } = await import('@/src/services/paymentSettlementAtomic');
    const result = await applyApprovedPaymentAtomic({
      purpose: 'electricity',
      provider: 'mock',
      offlineProvider: 'cash',
      providerPaymentId,
      amountPaise,
      invoiceId: base.sourceId,
      paidAt: receivedAt,
      rawPayload,
    });
    if (!result.ok) return { ok: false, error: result.reason };
    paymentId = result.paymentId;
  } else {
    const result = await allocateInvoicePayment({
      invoiceId: input.financialInvoiceId,
      amountPaise,
      providerPaymentId,
      paymentId: null,
      offlineProvider: 'cash',
    });
    if (!result.ok) return { ok: false, error: result.error };

    const [updated] = await db
      .select({ paymentId: financialInvoices.paymentId })
      .from(financialInvoices)
      .where(eq(financialInvoices.id, input.financialInvoiceId))
      .limit(1);
    paymentId = updated?.paymentId ?? null;
  }

  await writeCashSettlementAudit({
    session,
    financialInvoiceId: input.financialInvoiceId,
    invoiceNumber: eligibility.invoiceNumber,
    amountPaise,
    paymentId,
    notes: input.notes,
    receivedAt,
  });

  await syncActionItems(session).catch(() => undefined);
  revalidateAdminSurfaces();

  return { ok: true, paymentId };
}

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { customers, financialInvoices } from '@/src/db/schema';
import type { CustomerSession } from '@/src/lib/auth/session';
import { logger } from '@/src/lib/logger';
import { resolveFinancialInvoiceRef } from '@/src/lib/billing/resolveFinancialInvoiceRef';
import type { FinancialInvoiceStatus } from '@/src/db/schema/enums';

export type ResidentInvoiceDenialReason =
  | 'invoice_missing'
  | 'resident_mismatch'
  | 'customer_archived'
  | 'unauthorized_no_session'
  | 'unauthorized_must_set_password'
  | 'document_load_failed';

export type ResidentInvoiceAccessOk = {
  ok: true;
  invoiceId: string;
  invoiceNumber: string;
  invoiceStatus: FinancialInvoiceStatus;
  invoiceCustomerId: string;
  sessionCustomerId: string;
  sessionKind: 'customer';
};

export type ResidentInvoiceAccessDenied = {
  ok: false;
  reason: ResidentInvoiceDenialReason;
  ref: string;
  invoiceId?: string;
  invoiceNumber?: string;
  invoiceStatus?: FinancialInvoiceStatus;
  invoiceCustomerId?: string;
  sessionCustomerId?: string;
  sessionKind?: 'customer' | 'none';
};

export type ResidentInvoiceAccessResult =
  | ResidentInvoiceAccessOk
  | ResidentInvoiceAccessDenied;

export function logResidentInvoiceAccess(
  result: ResidentInvoiceAccessResult,
  meta: Record<string, unknown> = {},
): void {
  if (result.ok) {
    logger.info('resident_invoice_access_granted', {
      invoiceId: result.invoiceId,
      invoiceNumber: result.invoiceNumber,
      invoiceStatus: result.invoiceStatus,
      invoiceCustomerId: result.invoiceCustomerId,
      sessionCustomerId: result.sessionCustomerId,
      sessionKind: result.sessionKind,
      ...meta,
    });
    return;
  }

  logger.warn('resident_invoice_access_denied', {
    reason: result.reason,
    ref: result.ref,
    invoiceId: result.invoiceId,
    invoiceNumber: result.invoiceNumber,
    invoiceStatus: result.invoiceStatus,
    invoiceCustomerId: result.invoiceCustomerId,
    sessionCustomerId: result.sessionCustomerId,
    sessionKind: result.sessionKind ?? 'none',
    ...meta,
  });
}

/** Resolve invoice row including owner + status for access checks and logs. */
export async function loadFinancialInvoiceAccessRow(invoiceId: string) {
  const [row] = await db
    .select({
      id: financialInvoices.id,
      invoiceNumber: financialInvoices.invoiceNumber,
      status: financialInvoices.status,
      customerId: financialInvoices.customerId,
      customerArchivedAt: customers.archivedAt,
    })
    .from(financialInvoices)
    .innerJoin(customers, eq(customers.id, financialInvoices.customerId))
    .where(eq(financialInvoices.id, invoiceId))
    .limit(1);

  return row ?? null;
}

export async function checkResidentInvoiceAccess(
  ref: string,
  session: CustomerSession | null,
  opts?: { allowPasswordSetup?: boolean },
): Promise<ResidentInvoiceAccessResult> {
  const resolved = await resolveFinancialInvoiceRef(ref);
  if (!resolved) {
    return { ok: false, reason: 'invoice_missing', ref };
  }

  const row = await loadFinancialInvoiceAccessRow(resolved.id);
  if (!row) {
    return {
      ok: false,
      reason: 'invoice_missing',
      ref,
      invoiceId: resolved.id,
      invoiceNumber: resolved.invoiceNumber,
    };
  }

  if (row.customerArchivedAt) {
    return {
      ok: false,
      reason: 'customer_archived',
      ref,
      invoiceId: row.id,
      invoiceNumber: row.invoiceNumber,
      invoiceStatus: row.status,
      invoiceCustomerId: row.customerId,
    };
  }

  if (!session) {
    return {
      ok: false,
      reason: 'unauthorized_no_session',
      ref,
      invoiceId: row.id,
      invoiceNumber: row.invoiceNumber,
      invoiceStatus: row.status,
      invoiceCustomerId: row.customerId,
      sessionKind: 'none',
    };
  }

  if (session.mustSetPassword && !opts?.allowPasswordSetup) {
    return {
      ok: false,
      reason: 'unauthorized_must_set_password',
      ref,
      invoiceId: row.id,
      invoiceNumber: row.invoiceNumber,
      invoiceStatus: row.status,
      invoiceCustomerId: row.customerId,
      sessionCustomerId: session.customerId,
      sessionKind: 'customer',
    };
  }

  if (row.customerId !== session.customerId) {
    return {
      ok: false,
      reason: 'resident_mismatch',
      ref,
      invoiceId: row.id,
      invoiceNumber: row.invoiceNumber,
      invoiceStatus: row.status,
      invoiceCustomerId: row.customerId,
      sessionCustomerId: session.customerId,
      sessionKind: 'customer',
    };
  }

  return {
    ok: true,
    invoiceId: row.id,
    invoiceNumber: row.invoiceNumber,
    invoiceStatus: row.status,
    invoiceCustomerId: row.customerId,
    sessionCustomerId: session.customerId,
    sessionKind: 'customer',
  };
}

/** @deprecated Prefer checkResidentInvoiceAccess — kept for existing imports. */
export async function assertCustomerOwnsFinancialInvoiceDetailed(
  customerId: string,
  invoiceId: string,
): Promise<{ owns: boolean; invoiceCustomerId: string | null }> {
  const [row] = await db
    .select({ customerId: financialInvoices.customerId })
    .from(financialInvoices)
    .where(eq(financialInvoices.id, invoiceId))
    .limit(1);
  return {
    owns: row?.customerId === customerId,
    invoiceCustomerId: row?.customerId ?? null,
  };
}

export async function isCustomerArchived(customerId: string): Promise<boolean> {
  const [row] = await db
    .select({ archivedAt: customers.archivedAt })
    .from(customers)
    .where(and(eq(customers.id, customerId), isNull(customers.archivedAt)))
    .limit(1);
  return !row;
}

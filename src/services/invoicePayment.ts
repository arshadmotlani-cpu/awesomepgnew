/**
 * Allocate invoice payments to SSOT source rows (rent, electricity, deposit ledger).
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { financialInvoices, rentInvoices } from '@/src/db/schema';
import type { FinancialInvoice, InvoiceBreakdown } from '@/src/db/schema/financialInvoices';
import { syncDepositCollectionFromLedger } from '@/src/services/depositCollection';
import { recordDepositCollected } from '@/src/services/deposits';
import { recordElectricityPaymentSuccess } from '@/src/services/electricityBilling';
import { recordRentPaymentSuccess } from '@/src/services/rentInvoices';

type BreakdownLine = NonNullable<InvoiceBreakdown['lines']>[number];

async function applyLinePayment(
  line: BreakdownLine,
  bookingId: string | null,
  customerId: string,
  amountPaise: number,
  providerPaymentId: string,
): Promise<void> {
  if (amountPaise <= 0) return;

  if (line.sourceTable === 'rent_invoices' && line.sourceId) {
    await recordRentPaymentSuccess({
      provider: 'mock',
      offlineProvider: 'upi_manual',
      providerPaymentId: `${providerPaymentId}:rent:${line.sourceId}`,
      amountPaise,
      invoiceId: line.sourceId,
    });
    return;
  }

  if (line.sourceTable === 'electricity_invoices' && line.sourceId) {
    await recordElectricityPaymentSuccess({
      provider: 'mock',
      offlineProvider: 'upi_manual',
      providerPaymentId: `${providerPaymentId}:elec:${line.sourceId}`,
      amountPaise,
      invoiceId: line.sourceId,
    });
    return;
  }

  if (line.kind === 'deposit' && bookingId) {
    await recordDepositCollected({
      bookingId,
      customerId,
      amountPaise,
      reason: `Invoice payment ${providerPaymentId}`,
      relatedPaymentId: providerPaymentId,
    });
    await syncDepositCollectionFromLedger(bookingId);
  }
}

/** Apply payment to all breakdown lines on a financial invoice. */
export async function allocateInvoicePayment(input: {
  invoiceId: string;
  amountPaise: number;
  providerPaymentId: string;
  paymentId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [inv] = await db
    .select()
    .from(financialInvoices)
    .where(eq(financialInvoices.id, input.invoiceId))
    .limit(1);
  if (!inv) return { ok: false, error: 'Invoice not found.' };
  if (inv.status === 'cancelled' || inv.status === 'refunded') {
    return { ok: false, error: 'Invoice is not payable.' };
  }
  if (inv.status === 'payment_in_progress' || inv.status === 'processing') {
    // Allow allocation while proof is being verified.
  } else if (inv.status === 'paid' || inv.status === 'settled') {
    return { ok: false, error: 'Invoice is already paid.' };
  }

  const lines = inv.breakdown?.lines ?? [];
  const paidSoFar = inv.breakdown?.paidPaise ?? 0;
  const remaining = inv.amountPaise - paidSoFar;
  const applyAmount = Math.min(input.amountPaise, remaining);
  if (applyAmount <= 0) return { ok: false, error: 'Nothing due on this invoice.' };

  if (lines.length === 0) {
    if (inv.sourceTable === 'rent_invoices' && inv.sourceId) {
      await recordRentPaymentSuccess({
        provider: 'mock',
        offlineProvider: 'upi_manual',
        providerPaymentId: input.providerPaymentId,
        amountPaise: applyAmount,
        invoiceId: inv.sourceId,
      });
    } else if (
      inv.sourceTable === 'financial_invoices' ||
      ['custom', 'penalty', 'damage', 'ps4', 'combined'].includes(inv.invoiceType)
    ) {
      // Standalone financial invoice — allocation tracked on breakdown.paidPaise only.
    }
  } else {
    let left = applyAmount;
    for (const line of lines) {
      if (left <= 0) break;
      const lineAmt = Math.min(line.amountPaise, left);
      await applyLinePayment(line, inv.bookingId, inv.customerId, lineAmt, input.providerPaymentId);
      left -= lineAmt;
    }
  }

  const newPaid = paidSoFar + applyAmount;
  const newStatus =
    newPaid >= inv.amountPaise ? 'paid' : newPaid > 0 ? 'partial' : inv.status;

  await db
    .update(financialInvoices)
    .set({
      status: newStatus,
      paidAt: newStatus === 'paid' ? new Date() : inv.paidAt,
      paymentId: input.paymentId ?? inv.paymentId,
      breakdown: {
        ...(inv.breakdown ?? {}),
        paidPaise: newPaid,
      },
      updatedAt: new Date(),
    })
    .where(eq(financialInvoices.id, input.invoiceId));

  return { ok: true };
}

/** Reverse payment allocation when refunding a paid invoice. */
export async function reverseInvoicePaymentAllocation(inv: FinancialInvoice): Promise<void> {
  const lines = inv.breakdown?.lines ?? [];

  for (const line of lines) {
    if (line.sourceTable === 'rent_invoices' && line.sourceId) {
      const [ri] = await db
        .select()
        .from(rentInvoices)
        .where(eq(rentInvoices.id, line.sourceId))
        .limit(1);
      if (!ri) continue;
      const newPrincipal = Math.max(0, ri.paidPrincipalPaise - line.amountPaise);
      await db
        .update(rentInvoices)
        .set({
          paidPrincipalPaise: newPrincipal,
          status: newPrincipal < ri.rentPaise ? 'pending' : ri.status,
          paidAt: newPrincipal > 0 ? ri.paidAt : null,
          updatedAt: new Date(),
        })
        .where(eq(rentInvoices.id, line.sourceId));
      const { syncRentInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
      await syncRentInvoiceToUnified(line.sourceId);
    } else if (line.sourceTable === 'electricity_invoices' && line.sourceId) {
      const { electricityInvoices } = await import('@/src/db/schema');
      const [ei] = await db
        .select()
        .from(electricityInvoices)
        .where(eq(electricityInvoices.id, line.sourceId))
        .limit(1);
      if (!ei) continue;
      const newPaid = Math.max(0, ei.paidPaise - line.amountPaise);
      await db
        .update(electricityInvoices)
        .set({
          paidPaise: newPaid,
          status: newPaid < ei.amountPaise ? 'pending' : ei.status,
          paidAt: newPaid > 0 ? ei.paidAt : null,
          updatedAt: new Date(),
        })
        .where(eq(electricityInvoices.id, line.sourceId));
    } else if (line.kind === 'deposit' && inv.bookingId) {
      const { applyDepositDeduction } = await import('@/src/services/depositSettlement');
      const deducted = await applyDepositDeduction({
        bookingId: inv.bookingId,
        customerId: inv.customerId,
        amountPaise: line.amountPaise,
        reason: `Invoice refund reversal ${inv.invoiceNumber}`,
      });
      if (!deducted.ok) {
        throw new Error(deducted.error);
      }
    }
  }

  if (inv.sourceTable === 'rent_invoices' && inv.sourceId && lines.length === 0) {
    await db
      .update(rentInvoices)
      .set({
        status: 'pending',
        paidPrincipalPaise: 0,
        paidLateFeePaise: 0,
        paidAt: null,
        updatedAt: new Date(),
      })
      .where(eq(rentInvoices.id, inv.sourceId));
    const { syncRentInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
    await syncRentInvoiceToUnified(inv.sourceId);
  }
}

export async function recordDepositPaymentFromLink(input: {
  linkId: string;
  bookingId: string;
  customerId: string;
  amountPaise: number;
  providerPaymentId: string;
  reason?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.amountPaise <= 0) return { ok: false, error: 'Invalid amount.' };
  await recordDepositCollected({
    bookingId: input.bookingId,
    customerId: input.customerId,
    amountPaise: input.amountPaise,
    reason: input.reason ?? `Deposit payment link ${input.linkId}`,
    relatedPaymentId: input.providerPaymentId,
  });
  await syncDepositCollectionFromLedger(input.bookingId);
  return { ok: true };
}

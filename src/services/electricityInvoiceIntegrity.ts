/**
 * Electricity invoice integrity — reopen misallocated / incorrect paid states.
 * Engine action: corrects ledger truth when repair scripts mis-mark invoices paid.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, electricityInvoices, payments } from '@/src/db/schema';
import { syncElectricityInvoiceToUnifiedInTx } from '@/src/lib/billing/syncUnifiedInvoiceInTx';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';

export type ReopenElectricityInvoiceInput = {
  invoiceId: string;
  reason: string;
  /** When true, skip late-fee accrual until resident views the bill. */
  waiveLateFee?: boolean;
  actorType?: 'admin' | 'system';
  actorId?: string | null;
  dryRun?: boolean;
};

export type ReopenElectricityInvoiceResult = {
  ok: true;
  invoiceId: string;
  invoiceNumber: string;
  previousStatus: string;
  previousPaidPaise: number;
  previousPaymentId: string | null;
  outstandingPaise: number;
  lateFeeWaived: boolean;
  dryRun: boolean;
};

export async function reopenElectricityInvoice(
  input: ReopenElectricityInvoiceInput,
): Promise<ReopenElectricityInvoiceResult | { ok: false; reason: string }> {
  const [inv] = await db
    .select()
    .from(electricityInvoices)
    .where(eq(electricityInvoices.id, input.invoiceId))
    .limit(1);

  if (!inv) return { ok: false, reason: 'Invoice not found' };
  if (inv.status === 'cancelled') return { ok: false, reason: 'Cannot reopen cancelled invoice' };

  const projected = projectElectricityInvoice({
    ...inv,
    status: 'pending',
    paidPaise: 0,
    lateFeeWaived: input.waiveLateFee ?? false,
  });

  if (input.dryRun) {
    return {
      ok: true,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      previousStatus: inv.status,
      previousPaidPaise: inv.paidPaise,
      previousPaymentId: inv.paymentId,
      outstandingPaise: projected.outstandingPaise,
      lateFeeWaived: input.waiveLateFee ?? false,
      dryRun: true,
    };
  }

  await db.transaction(async (tx) => {
    if (inv.paymentId) {
      await tx
        .delete(payments)
        .where(
          and(eq(payments.id, inv.paymentId), eq(payments.purpose, 'electricity')),
        );
    }

    await tx
      .update(electricityInvoices)
      .set({
        status: 'pending',
        paidPaise: 0,
        paymentId: null,
        paidAt: null,
        lateFeeLockedPaise: null,
        lateFeeWaived: input.waiveLateFee ?? false,
        firstViewedAt: null,
        viewedSource: null,
        updatedAt: new Date(),
      })
      .where(eq(electricityInvoices.id, inv.id));

    await syncElectricityInvoiceToUnifiedInTx(tx, inv.id);

    await tx.insert(auditLog).values({
      actorType: input.actorType ?? 'system',
      actorId: input.actorId ?? null,
      entity: 'electricity_invoice',
      entityId: inv.id,
      action: 'electricity_invoice_reopened',
      diff: {
        reason: input.reason,
        previousStatus: inv.status,
        previousPaidPaise: inv.paidPaise,
        previousPaymentId: inv.paymentId,
        lateFeeWaived: input.waiveLateFee ?? false,
      },
    });
  });

  return {
    ok: true,
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    previousStatus: inv.status,
    previousPaidPaise: inv.paidPaise,
    previousPaymentId: inv.paymentId,
    outstandingPaise: projected.outstandingPaise,
    lateFeeWaived: input.waiveLateFee ?? false,
    dryRun: false,
  };
}

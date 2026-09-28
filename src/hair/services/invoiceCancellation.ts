import { and, eq, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhInvoices } from '@/src/hair/db/schema';
import { reconcileCustomerWalletCache } from '@/src/hair/domain/ledger/service';
import {
  appendCancellationAudit,
  invoiceCanBeCancelled,
} from '@/src/hair/lib/billing/invoiceCancellationPlan';
import { orgFilter, locationFilter } from '@/src/hair/lib/tenant/filters';
import { resolveTenantContextForService } from '@/src/hair/lib/tenant/serviceContext';
import type { TenantContext } from '@/src/hair/lib/tenant/types';

/**
 * Marks an issued invoice void. Lines, payments, and attributions stay.
 * Active revenue, dues, collections, and wallet balances ignore void invoices.
 */
export async function cancelInvoice(
  invoiceId: string,
  input: { reason: string; actor: string; at?: Date },
  ctx?: TenantContext | null,
): Promise<{ invoiceId: string; invoiceNumber: string }> {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error('Enter a cancellation reason');

  ctx = await resolveTenantContextForService(ctx);
  const at = input.at ?? new Date();

  return hairDb.transaction(async (tx) => {
    const db = tx as unknown as typeof hairDb;
    await db.execute(sql`SELECT id FROM fyh_invoices WHERE id = ${invoiceId} FOR UPDATE`);

    const [invoice] = await db
      .select()
      .from(fyhInvoices)
      .where(
        and(
          orgFilter(fyhInvoices.organizationId, ctx),
          locationFilter(fyhInvoices.locationId, ctx),
          eq(fyhInvoices.id, invoiceId),
        ),
      )
      .limit(1);
    if (!invoice) throw new Error('Invoice not found');
    if (!invoiceCanBeCancelled(invoice.status)) {
      throw new Error('This invoice is already cancelled');
    }

    await db
      .update(fyhInvoices)
      .set({
        status: 'void',
        voidedAt: at,
        notes: appendCancellationAudit(invoice.notes, { at, actor: input.actor, reason }),
        updatedAt: at,
      })
      .where(
        and(
          orgFilter(fyhInvoices.organizationId, ctx),
          locationFilter(fyhInvoices.locationId, ctx),
          eq(fyhInvoices.id, invoiceId),
        ),
      );

    await reconcileCustomerWalletCache(db, invoice.customerId, ctx);

    return { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber };
  });
}

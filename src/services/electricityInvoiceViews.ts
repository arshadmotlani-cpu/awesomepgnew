/**
 * Record first view of an electricity invoice by a resident.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { electricityInvoices } from '@/src/db/schema';

export type ElectricityInvoiceViewSource = 'pay_page' | 'public_share';

export async function recordElectricityInvoiceView(input: {
  invoiceId: string;
  source: ElectricityInvoiceViewSource;
}): Promise<{ recorded: boolean }> {
  const [updated] = await db
    .update(electricityInvoices)
    .set({
      firstViewedAt: new Date(),
      viewedSource: input.source,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(electricityInvoices.id, input.invoiceId),
        isNull(electricityInvoices.firstViewedAt),
      ),
    )
    .returning({ id: electricityInvoices.id });

  return { recorded: updated != null };
}

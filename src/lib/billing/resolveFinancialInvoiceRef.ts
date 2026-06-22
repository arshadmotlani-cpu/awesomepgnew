import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { financialInvoices } from '@/src/db/schema';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isFinancialInvoiceUuid(ref: string): boolean {
  return UUID_RE.test(ref.trim());
}

/** Resolve financial invoice by primary key or human-readable invoice number (INV-*, RNT-*). */
export async function resolveFinancialInvoiceRef(
  ref: string,
): Promise<{ id: string; invoiceNumber: string } | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;

  const [row] = await db
    .select({
      id: financialInvoices.id,
      invoiceNumber: financialInvoices.invoiceNumber,
    })
    .from(financialInvoices)
    .where(
      isFinancialInvoiceUuid(trimmed)
        ? eq(financialInvoices.id, trimmed)
        : eq(financialInvoices.invoiceNumber, trimmed),
    )
    .limit(1);

  return row ?? null;
}

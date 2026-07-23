import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { pgs } from '@/src/db/schema';
import type { InvoiceDocumentLetterhead } from '@/src/lib/billing/invoiceDocumentModel';
import { buildFallbackPgLetterhead } from '@/src/lib/billing/pgLetterheadFallback';

function resolveGstin(): string {
  return process.env.AWESOME_PG_GSTIN?.trim() || 'GSTIN on request';
}

function formatPgAddress(pg: {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  pincode: string;
}): string[] {
  const lines = [pg.addressLine1];
  if (pg.addressLine2?.trim()) lines.push(pg.addressLine2.trim());
  lines.push(`${pg.city}, ${pg.state} ${pg.pincode}`);
  return lines;
}

export { buildFallbackPgLetterhead } from '@/src/lib/billing/pgLetterheadFallback';

export async function loadPgLetterhead(pgId: string, pgName: string): Promise<InvoiceDocumentLetterhead> {
  const [pgRow] = await db
    .select({
      addressLine1: pgs.addressLine1,
      addressLine2: pgs.addressLine2,
      city: pgs.city,
      state: pgs.state,
      pincode: pgs.pincode,
      contactPhone: pgs.contactPhone,
      contactEmail: pgs.contactEmail,
    })
    .from(pgs)
    .where(eq(pgs.id, pgId))
    .limit(1);

  return {
    businessName: 'Awesome PG',
    pgName,
    addressLines: pgRow ? formatPgAddress(pgRow) : [pgName],
    gstin: resolveGstin(),
    contactPhone: pgRow?.contactPhone ?? null,
    contactEmail: pgRow?.contactEmail ?? null,
  };
}

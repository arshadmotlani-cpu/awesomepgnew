/**
 * Financial invoice numbering — INV-{YEAR}-{PROPERTY_CODE}-{SEQUENCE}
 *
 * Used for NEW inserts into financial_invoices (express walk-in deposit-only,
 * custom charges, invoiceGeneration, express collection financial rows).
 *
 * Rent-synced financial rows keep mirroring rent_invoices.invoice_number (RNT-*)
 * for backward compatibility — see syncRentInvoiceToUnified().
 */

import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { financialInvoices, pgs } from '@/src/db/schema';

/** First segment of PG slug, 3 chars uppercase; name fallback if slug too short. */
export function derivePropertyCode(slug: string, name?: string | null): string {
  const segment = slug.split(/[-_]/)[0]?.replace(/[^a-zA-Z0-9]/g, '') ?? '';
  if (segment.length >= 3) return segment.slice(0, 3).toUpperCase();

  const fromName = (name ?? '').replace(/[^a-zA-Z]/g, '');
  if (fromName.length >= 3) return fromName.slice(0, 3).toUpperCase();
  if (segment.length > 0) return segment.toUpperCase().padEnd(3, 'X');
  if (fromName.length > 0) return fromName.toUpperCase().padEnd(3, 'X');

  return 'PGX';
}

export function invoiceNumberPrefix(year: number, propertyCode: string): string {
  return `INV-${year}-${propertyCode}-`;
}

export function formatInvoiceSequence(sequence: number): string {
  return String(Math.max(1, sequence)).padStart(4, '0');
}

export function buildFinancialInvoiceNumber(
  year: number,
  propertyCode: string,
  sequence: number,
): string {
  return `${invoiceNumberPrefix(year, propertyCode)}${formatInvoiceSequence(sequence)}`;
}

export type NextFinancialInvoiceNumberInput = {
  pgId: string;
  /** Calendar year for sequence scope. Defaults to current UTC year. */
  year?: number;
};

/** Allocate the next invoice number unique per PG per calendar year. */
export async function nextFinancialInvoiceNumber(
  input: NextFinancialInvoiceNumberInput,
): Promise<string> {
  const year = input.year ?? new Date().getUTCFullYear();

  const [pg] = await db
    .select({ slug: pgs.slug, name: pgs.name })
    .from(pgs)
    .where(eq(pgs.id, input.pgId))
    .limit(1);

  if (!pg) {
    throw new Error(`PG not found for invoice numbering: ${input.pgId}`);
  }

  const propertyCode = derivePropertyCode(pg.slug, pg.name);
  const prefix = invoiceNumberPrefix(year, propertyCode);

  const rows = await db.execute<{ c: number }>(sql`
    SELECT count(*)::int AS c
    FROM financial_invoices
    WHERE pg_id = ${input.pgId}
      AND invoice_number LIKE ${prefix + '%'}
  `);

  const seq = Number(rows[0]?.c ?? 0) + 1;
  return buildFinancialInvoiceNumber(year, propertyCode, seq);
}

/** Count existing numbers for a PG/year prefix (for tests). */
export async function countFinancialInvoicesForPrefix(
  pgId: string,
  prefix: string,
): Promise<number> {
  const rows = await db.execute<{ c: number }>(sql`
    SELECT count(*)::int AS c
    FROM financial_invoices
    WHERE pg_id = ${pgId}
      AND invoice_number LIKE ${prefix + '%'}
  `);
  return Number(rows[0]?.c ?? 0);
}

/** Resolve financial invoice id from a mirrored source row. */
export async function lookupFinancialInvoiceIdBySource(
  sourceTable: string,
  sourceId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: financialInvoices.id })
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.sourceTable, sourceTable),
        eq(financialInvoices.sourceId, sourceId),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

export type FinancialInvoiceSourceRef = {
  sourceTable: string;
  sourceId: string;
};

function sourceRefKey(sourceTable: string, sourceId: string): string {
  return `${sourceTable}:${sourceId}`;
}

/** Batch-resolve financial invoice ids for mirrored source rows. */
export async function batchLookupFinancialInvoiceIds(
  refs: FinancialInvoiceSourceRef[],
): Promise<Record<string, string>> {
  if (refs.length === 0) return {};

  const unique = Array.from(
    new Map(refs.map((r) => [sourceRefKey(r.sourceTable, r.sourceId), r])).values(),
  );

  const rows = await db
    .select({
      id: financialInvoices.id,
      sourceTable: financialInvoices.sourceTable,
      sourceId: financialInvoices.sourceId,
    })
    .from(financialInvoices)
    .where(
      or(
        ...unique.map((r) =>
          and(
            eq(financialInvoices.sourceTable, r.sourceTable),
            eq(financialInvoices.sourceId, r.sourceId),
          ),
        ),
      ),
    );

  const out: Record<string, string> = {};
  for (const row of rows) {
    if (row.sourceTable && row.sourceId) {
      out[sourceRefKey(row.sourceTable, row.sourceId)] = row.id;
    }
  }
  return out;
}

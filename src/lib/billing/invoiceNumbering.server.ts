import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { financialInvoices, pgs } from '@/src/db/schema';
import {
  buildFinancialInvoiceNumber,
  derivePropertyCode,
  invoiceNumberPrefix,
  type FinancialInvoiceSourceRef,
  type NextFinancialInvoiceNumberInput,
} from '@/src/lib/billing/invoiceNumbering';
import { isFinancialInvoiceUuid } from '@/src/lib/billing/resolveFinancialInvoiceRef';

export type { FinancialInvoiceSourceRef, NextFinancialInvoiceNumberInput };

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

function sourceRefKey(sourceTable: string, sourceId: string): string {
  return `${sourceTable}:${sourceId}`;
}

/** Batch-resolve financial invoice ids for mirrored source rows. */
export async function batchLookupFinancialInvoiceIds(
  refs: FinancialInvoiceSourceRef[],
): Promise<Record<string, string>> {
  if (refs.length === 0) return {};

  const unique = Array.from(
    new Map(
      refs
        .filter((r) => isFinancialInvoiceUuid(r.sourceId))
        .map((r) => [sourceRefKey(r.sourceTable, r.sourceId), r]),
    ).values(),
  );

  if (unique.length === 0) return {};

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

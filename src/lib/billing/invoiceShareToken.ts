/**
 * Public invoice share tokens — /i/{shareToken} (no login, no UUID in URL).
 */
import { randomBytes } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { financialInvoices } from '@/src/db/schema';

const TOKEN_BYTES = 16;

/** New row default — unique token at invoice creation (audit requirement). */
export function createInvoiceShareToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function invoicePublicSharePath(shareToken: string): string {
  return `/i/${shareToken.trim()}`;
}

/** Idempotent — creates share_token once and reuses forever. */
export async function ensureInvoiceShareToken(invoiceId: string): Promise<string> {
  const [existing] = await db
    .select({ shareToken: financialInvoices.shareToken })
    .from(financialInvoices)
    .where(eq(financialInvoices.id, invoiceId))
    .limit(1);

  if (!existing) {
    throw new Error('Invoice not found');
  }
  if (existing.shareToken) {
    return existing.shareToken;
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const token = createInvoiceShareToken();
    const [updated] = await db
      .update(financialInvoices)
      .set({ shareToken: token, updatedAt: new Date() })
      .where(
        and(eq(financialInvoices.id, invoiceId), isNull(financialInvoices.shareToken)),
      )
      .returning({ shareToken: financialInvoices.shareToken });

    if (updated?.shareToken) {
      return updated.shareToken;
    }

    const [again] = await db
      .select({ shareToken: financialInvoices.shareToken })
      .from(financialInvoices)
      .where(eq(financialInvoices.id, invoiceId))
      .limit(1);
    if (again?.shareToken) {
      return again.shareToken;
    }
  }

  throw new Error('Could not allocate invoice share token');
}

export async function resolveInvoiceIdByShareToken(
  shareToken: string,
): Promise<string | null> {
  const normalized = shareToken.trim();
  if (!normalized) return null;

  const [row] = await db
    .select({ id: financialInvoices.id })
    .from(financialInvoices)
    .where(eq(financialInvoices.shareToken, normalized))
    .limit(1);

  return row?.id ?? null;
}

export async function getInvoiceShareToken(invoiceId: string): Promise<string | null> {
  const [row] = await db
    .select({ shareToken: financialInvoices.shareToken })
    .from(financialInvoices)
    .where(eq(financialInvoices.id, invoiceId))
    .limit(1);
  return row?.shareToken ?? null;
}

/** Backfill missing share_token rows (idempotent repair). */
export async function backfillAllInvoiceShareTokens(opts?: {
  limit?: number;
}): Promise<{ backfilled: number; remaining: number }> {
  const limit = opts?.limit ?? 500;
  const missing = await db
    .select({ id: financialInvoices.id })
    .from(financialInvoices)
    .where(isNull(financialInvoices.shareToken))
    .limit(limit);

  let backfilled = 0;
  for (const row of missing) {
    await ensureInvoiceShareToken(row.id);
    backfilled += 1;
  }

  const [remainingRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(financialInvoices)
    .where(isNull(financialInvoices.shareToken));

  return { backfilled, remaining: remainingRow?.count ?? 0 };
}

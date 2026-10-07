/**
 * DB access for pg_approved_transaction_refs — works before and after migration 0155.
 */
import { and, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { pgApprovedTransactionRefs } from '@/src/db/schema';
import type { PgApprovedTxnSourceKind } from '@/src/db/schema/pgApprovedTransactionRefs';
import { getPgApprovedTxnRefSchemaMode } from '@/src/lib/db/pgApprovedTxnRefSchema';

export type ApprovedTxnRefRegistryRow = {
  id: string | null;
  transactionRefNormalized: string;
  sourceKind: PgApprovedTxnSourceKind;
  sourceId: string;
  approvedAt: Date | null;
  approvedByAdminId: string | null;
};

function mapLegacyRow(row: {
  transaction_ref_normalized: string;
  source_kind: string;
  source_id: string;
  approved_at: Date | string | null;
  approved_by_admin_id: string | null;
}): ApprovedTxnRefRegistryRow {
  return {
    id: null,
    transactionRefNormalized: row.transaction_ref_normalized,
    sourceKind: row.source_kind as PgApprovedTxnSourceKind,
    sourceId: row.source_id,
    approvedAt: row.approved_at ? new Date(row.approved_at) : null,
    approvedByAdminId: row.approved_by_admin_id,
  };
}

export async function listApprovedTxnRefsByNormalizedRef(
  normalizedRef: string,
): Promise<ApprovedTxnRefRegistryRow[]> {
  const mode = await getPgApprovedTxnRefSchemaMode();
  if (mode === 'multi_row') {
    const rows = await db
      .select()
      .from(pgApprovedTransactionRefs)
      .where(eq(pgApprovedTransactionRefs.transactionRefNormalized, normalizedRef));
    return rows.map((row) => ({
      id: row.id,
      transactionRefNormalized: row.transactionRefNormalized,
      sourceKind: row.sourceKind as PgApprovedTxnSourceKind,
      sourceId: row.sourceId,
      approvedAt: row.approvedAt,
      approvedByAdminId: row.approvedByAdminId,
    }));
  }

  const rows = await db.execute<{
    transaction_ref_normalized: string;
    source_kind: string;
    source_id: string;
    approved_at: Date | string | null;
    approved_by_admin_id: string | null;
  }>(sql`
    SELECT transaction_ref_normalized, source_kind, source_id, approved_at, approved_by_admin_id
    FROM pg_approved_transaction_refs
    WHERE transaction_ref_normalized = ${normalizedRef}
  `);
  return rows.map(mapLegacyRow);
}

export async function findApprovedTxnRefBySource(input: {
  sourceKind: PgApprovedTxnSourceKind;
  sourceId: string;
}): Promise<ApprovedTxnRefRegistryRow | null> {
  const mode = await getPgApprovedTxnRefSchemaMode();
  if (mode === 'multi_row') {
    const [row] = await db
      .select()
      .from(pgApprovedTransactionRefs)
      .where(
        and(
          eq(pgApprovedTransactionRefs.sourceKind, input.sourceKind),
          eq(pgApprovedTransactionRefs.sourceId, input.sourceId),
        ),
      )
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      transactionRefNormalized: row.transactionRefNormalized,
      sourceKind: row.sourceKind as PgApprovedTxnSourceKind,
      sourceId: row.sourceId,
      approvedAt: row.approvedAt,
      approvedByAdminId: row.approvedByAdminId,
    };
  }

  const rows = await db.execute<{
    transaction_ref_normalized: string;
    source_kind: string;
    source_id: string;
    approved_at: Date | string | null;
    approved_by_admin_id: string | null;
  }>(sql`
    SELECT transaction_ref_normalized, source_kind, source_id, approved_at, approved_by_admin_id
    FROM pg_approved_transaction_refs
    WHERE source_kind = ${input.sourceKind}
      AND source_id = ${input.sourceId}::uuid
    LIMIT 1
  `);
  const row = rows[0];
  return row ? mapLegacyRow(row) : null;
}

export async function insertApprovedTxnRefRow(input: {
  transactionRefNormalized: string;
  sourceKind: PgApprovedTxnSourceKind;
  sourceId: string;
  approvedByAdminId: string | null;
}): Promise<void> {
  const mode = await getPgApprovedTxnRefSchemaMode();
  if (mode === 'multi_row') {
    await db.insert(pgApprovedTransactionRefs).values({
      transactionRefNormalized: input.transactionRefNormalized,
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      approvedByAdminId: input.approvedByAdminId,
    });
    return;
  }

  await db.execute(sql`
    INSERT INTO pg_approved_transaction_refs (
      transaction_ref_normalized,
      source_kind,
      source_id,
      approved_by_admin_id
    ) VALUES (
      ${input.transactionRefNormalized},
      ${input.sourceKind},
      ${input.sourceId}::uuid,
      ${input.approvedByAdminId}
    )
  `);
}

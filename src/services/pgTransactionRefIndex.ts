/**
 * PG-side scan + registry for normalized transaction refs across proof tables.
 */

import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  electricityInvoices,
  paymentLinks,
  pgApprovedTransactionRefs,
  pgPaymentRecords,
  playstationMemberships,
  rentInvoices,
  stayExtensions,
} from '@/src/db/schema';
import type { PgApprovedTxnSourceKind } from '@/src/db/schema/pgApprovedTransactionRefs';
import {
  assertTransactionRefRequired,
  buildDuplicateFlags,
  isApprovedTransactionRefUniqueViolation,
  approvedTransactionRefConflictMessage,
  normalizeTransactionRef,
  type TransactionRefMatch,
} from '@/src/lib/payments/transactionRefDuplicate';
import {
  validateDuplicateTransactionRefOverrideReason,
  type DuplicateTransactionRefOverrideInput,
  type DuplicateTransactionRefReviewContext,
} from '@/src/lib/payments/duplicateTransactionRefOverride';
import { writeAuditLogNonBlocking } from '@/src/lib/audit/writeAuditLog';

export type PgTxnSourceKind = PgApprovedTxnSourceKind;

export async function findPgTransactionRefMatches(input: {
  normalizedRef: string;
  exclude?: { kind: PgTxnSourceKind; id: string };
}): Promise<TransactionRefMatch[]> {
  const ref = input.normalizedRef;
  const exclude = input.exclude;
  const matches: TransactionRefMatch[] = [];

  const qrRows = await db
    .select({
      id: pgPaymentRecords.id,
      status: pgPaymentRecords.status,
      createdAt: pgPaymentRecords.createdAt,
      reviewedAt: pgPaymentRecords.reviewedAt,
      customerId: pgPaymentRecords.customerId,
    })
    .from(pgPaymentRecords)
    .where(
      and(
        sql`lower(trim(${pgPaymentRecords.transactionRef})) = ${ref}`,
        exclude?.kind === 'pg_payment_record'
          ? ne(pgPaymentRecords.id, exclude.id)
          : undefined,
      ),
    );
  for (const r of qrRows) {
    matches.push({
      id: r.id,
      status: r.status,
      sourceKind: 'pg_payment_record',
      submittedAt: r.createdAt,
      reviewedAt: r.reviewedAt,
      customerId: r.customerId,
    });
  }

  const rentRows = await db
    .select({
      id: rentInvoices.id,
      status: rentInvoices.status,
      proofSubmittedAt: rentInvoices.proofSubmittedAt,
      customerId: rentInvoices.customerId,
    })
    .from(rentInvoices)
    .where(
      and(
        sql`lower(trim(${rentInvoices.paymentProofTransactionRef})) = ${ref}`,
        exclude?.kind === 'rent_invoice' ? ne(rentInvoices.id, exclude.id) : undefined,
      ),
    );
  for (const r of rentRows) {
    const status =
      r.status === 'paid' ? 'approved' : r.status === 'payment_in_progress' ? 'pending' : r.status;
    matches.push({
      id: r.id,
      status,
      sourceKind: 'rent_invoice',
      submittedAt: r.proofSubmittedAt,
      customerId: r.customerId,
    });
  }

  const elecRows = await db
    .select({
      id: electricityInvoices.id,
      status: electricityInvoices.status,
      customerId: electricityInvoices.customerId,
      updatedAt: electricityInvoices.updatedAt,
    })
    .from(electricityInvoices)
    .where(
      and(
        sql`lower(trim(${electricityInvoices.paymentProofTransactionRef})) = ${ref}`,
        exclude?.kind === 'electricity_invoice'
          ? ne(electricityInvoices.id, exclude.id)
          : undefined,
      ),
    );
  for (const r of elecRows) {
    matches.push({
      id: r.id,
      status: r.status === 'paid' ? 'approved' : r.status === 'pending' ? 'pending' : r.status,
      sourceKind: 'electricity_invoice',
      submittedAt: r.updatedAt,
      customerId: r.customerId,
    });
  }

  const extRows = await db
    .select({
      id: stayExtensions.id,
      status: stayExtensions.status,
      updatedAt: stayExtensions.updatedAt,
    })
    .from(stayExtensions)
    .where(
      and(
        sql`lower(trim(${stayExtensions.paymentProofTransactionRef})) = ${ref}`,
        exclude?.kind === 'stay_extension' ? ne(stayExtensions.id, exclude.id) : undefined,
      ),
    );
  for (const r of extRows) {
    matches.push({
      id: r.id,
      status: r.status === 'approved' || r.status === 'paid' ? 'approved' : r.status,
      sourceKind: 'stay_extension',
      submittedAt: r.updatedAt,
    });
  }

  const linkRows = await db
    .select({
      id: paymentLinks.id,
      status: paymentLinks.status,
      createdAt: paymentLinks.createdAt,
      residentId: paymentLinks.residentId,
    })
    .from(paymentLinks)
    .where(
      and(
        sql`lower(trim(${paymentLinks.paymentProofTransactionRef})) = ${ref}`,
        exclude?.kind === 'payment_link' ? ne(paymentLinks.id, exclude.id) : undefined,
      ),
    );
  for (const r of linkRows) {
    matches.push({
      id: r.id,
      status: r.status === 'paid' || r.status === 'active' ? 'approved' : 'pending',
      sourceKind: 'payment_link',
      submittedAt: r.createdAt,
      customerId: r.residentId,
    });
  }

  const ps4Rows = await db
    .select({
      id: playstationMemberships.id,
      status: playstationMemberships.status,
      updatedAt: playstationMemberships.updatedAt,
      customerId: playstationMemberships.customerId,
    })
    .from(playstationMemberships)
    .where(
      and(
        sql`lower(trim(${playstationMemberships.transactionRef})) = ${ref}`,
        exclude?.kind === 'playstation_membership'
          ? ne(playstationMemberships.id, exclude.id)
          : undefined,
      ),
    );
  for (const r of ps4Rows) {
    matches.push({
      id: r.id,
      status: r.status === 'active' ? 'approved' : r.status === 'pending_payment' ? 'pending' : r.status,
      sourceKind: 'playstation_membership',
      submittedAt: r.updatedAt,
      customerId: r.customerId,
    });
  }

  return matches;
}

export async function resolveDuplicateFlagsForSubmit(input: {
  transactionRef: string;
  exclude?: { kind: PgTxnSourceKind; id: string };
}): Promise<{
  normalizedRef: string;
  possibleDuplicate: boolean;
  duplicateOfIds: string[];
  matches: TransactionRefMatch[];
}> {
  const normalizedRef = assertTransactionRefRequired(input.transactionRef);
  const matches = await findPgTransactionRefMatches({
    normalizedRef,
    exclude: input.exclude,
  });
  const flags = buildDuplicateFlags(matches);
  return { normalizedRef, matches, ...flags };
}

async function findApprovedRegistrySiblings(input: {
  normalizedRef: string;
  exclude?: { sourceKind: PgTxnSourceKind; sourceId: string };
}) {
  const rows = await db
    .select()
    .from(pgApprovedTransactionRefs)
    .where(eq(pgApprovedTransactionRefs.transactionRefNormalized, input.normalizedRef));
  return rows.filter(
    (row) =>
      !(
        input.exclude &&
        row.sourceKind === input.exclude.sourceKind &&
        row.sourceId === input.exclude.sourceId
      ),
  );
}

async function logDuplicateTransactionRefOverrideAudit(input: {
  normalizedRef: string;
  sourceKind: PgTxnSourceKind;
  sourceId: string;
  adminId: string;
  reason: string;
  conflicting: Array<{ sourceKind: string; sourceId: string }>;
}): Promise<void> {
  void writeAuditLogNonBlocking(db, {
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'payment_proof',
    entityId: input.sourceId,
    action: 'duplicate_transaction_ref_override',
    diff: {
      transactionRefNormalized: input.normalizedRef,
      sourceKind: input.sourceKind,
      conflictingPayments: input.conflicting,
      overrideReason: input.reason,
    },
  });
}

export async function resolveDuplicateTransactionRefReviewContext(input: {
  transactionRef: string | null | undefined;
  exclude?: { kind: PgTxnSourceKind; id: string };
}): Promise<DuplicateTransactionRefReviewContext> {
  const normalizedRef = normalizeTransactionRef(input.transactionRef);
  if (!normalizedRef) {
    return {
      requiresOverride: false,
      normalizedRef: null,
      approvedRegistryConflicts: [],
      crossMatches: [],
    };
  }
  const exclude =
    input.exclude != null
      ? { sourceKind: input.exclude.kind, sourceId: input.exclude.id }
      : undefined;
  const registryConflicts = await findApprovedRegistrySiblings({
    normalizedRef,
    exclude,
  });
  const matches = await findPgTransactionRefMatches({
    normalizedRef,
    exclude: input.exclude,
  });
  return {
    requiresOverride: registryConflicts.length > 0,
    normalizedRef,
    approvedRegistryConflicts: registryConflicts.map((row) => ({
      sourceKind: row.sourceKind,
      sourceId: row.sourceId,
      approvedAt: row.approvedAt?.toISOString?.() ?? null,
      approvedByAdminId: row.approvedByAdminId ?? null,
    })),
    crossMatches: matches.map((m) => ({
      id: m.id,
      status: m.status,
      sourceKind: m.sourceKind,
    })),
  };
}

export function reviewKindToTxnSourceKind(
  kind: 'qr' | 'rent' | 'electricity' | 'extension' | 'deposit_link',
): PgTxnSourceKind {
  if (kind === 'qr') return 'pg_payment_record';
  if (kind === 'rent') return 'rent_invoice';
  if (kind === 'electricity') return 'electricity_invoice';
  if (kind === 'extension') return 'stay_extension';
  return 'payment_link';
}

export async function registerApprovedTransactionRef(input: {
  transactionRef: string | null | undefined;
  sourceKind: PgTxnSourceKind;
  sourceId: string;
  approvedByAdminId?: string | null;
  duplicateOverride?: DuplicateTransactionRefOverrideInput | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await insertApprovedTransactionRefOrThrow(input);
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message === approvedTransactionRefConflictMessage()) {
      return { ok: false, message: err.message };
    }
    throw err;
  }
}

/** Prefer insert that throws on conflict for race-safe approve. */
export async function insertApprovedTransactionRefOrThrow(input: {
  transactionRef: string | null | undefined;
  sourceKind: PgTxnSourceKind;
  sourceId: string;
  approvedByAdminId?: string | null;
  duplicateOverride?: DuplicateTransactionRefOverrideInput | null;
}): Promise<void> {
  const normalized = normalizeTransactionRef(input.transactionRef);
  if (!normalized) return;

  const siblings = await findApprovedRegistrySiblings({
    normalizedRef: normalized,
    exclude: { sourceKind: input.sourceKind, sourceId: input.sourceId },
  });

  if (siblings.length > 0) {
    if (!input.duplicateOverride) {
      throw new Error(approvedTransactionRefConflictMessage());
    }
    const reasonCheck = validateDuplicateTransactionRefOverrideReason(
      input.duplicateOverride.reason,
    );
    if (!reasonCheck.ok) {
      throw new Error(reasonCheck.message);
    }
    const adminId = input.approvedByAdminId;
    if (!adminId) {
      throw new Error('Admin session required for duplicate transaction override.');
    }
    await logDuplicateTransactionRefOverrideAudit({
      normalizedRef: normalized,
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      adminId,
      reason: reasonCheck.reason,
      conflicting: siblings.map((s) => ({
        sourceKind: s.sourceKind,
        sourceId: s.sourceId,
      })),
    });
  }

  const [existingSelf] = await db
    .select()
    .from(pgApprovedTransactionRefs)
    .where(
      and(
        eq(pgApprovedTransactionRefs.sourceKind, input.sourceKind),
        eq(pgApprovedTransactionRefs.sourceId, input.sourceId),
      ),
    )
    .limit(1);
  if (existingSelf) return;

  try {
    await db.insert(pgApprovedTransactionRefs).values({
      transactionRefNormalized: normalized,
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      approvedByAdminId: input.approvedByAdminId ?? null,
    });
  } catch (err) {
    if (isApprovedTransactionRefUniqueViolation(err)) {
      const [existingSelfRetry] = await db
        .select()
        .from(pgApprovedTransactionRefs)
        .where(
          and(
            eq(pgApprovedTransactionRefs.sourceKind, input.sourceKind),
            eq(pgApprovedTransactionRefs.sourceId, input.sourceId),
          ),
        )
        .limit(1);
      if (existingSelfRetry) return;
      throw new Error(approvedTransactionRefConflictMessage());
    }
    throw err;
  }
}

/** Shared approve path — returns user-facing message instead of throwing on duplicate block. */
export async function registerApprovedTransactionRefForProofApproval(input: {
  transactionRef: string | null | undefined;
  sourceKind: PgTxnSourceKind;
  sourceId: string;
  approvedByAdminId: string;
  duplicateOverride?: DuplicateTransactionRefOverrideInput | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await insertApprovedTransactionRefOrThrow(input);
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message === approvedTransactionRefConflictMessage()) {
      return { ok: false, message: err.message };
    }
    if (err instanceof Error) {
      return { ok: false, message: err.message };
    }
    throw err;
  }
}

export function hasTxnOrScreenshotProof(input: {
  paymentProofUrl?: string | null;
  transactionRef?: string | null;
}): boolean {
  return Boolean(
    normalizeTransactionRef(input.transactionRef) ||
      input.paymentProofUrl?.trim(),
  );
}

/**
 * PG-side scan + registry for normalized transaction refs across proof tables.
 */

import { and, eq, ne, or, sql } from 'drizzle-orm';
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
      status: r.status === 'approved' || r.status === 'completed' ? 'approved' : r.status,
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
      status: r.status === 'paid' || r.status === 'completed' ? 'approved' : 'pending',
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

export async function registerApprovedTransactionRef(input: {
  transactionRef: string | null | undefined;
  sourceKind: PgTxnSourceKind;
  sourceId: string;
  approvedByAdminId?: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const normalized = normalizeTransactionRef(input.transactionRef);
  if (!normalized) return { ok: true };

  try {
    await db
      .insert(pgApprovedTransactionRefs)
      .values({
        transactionRefNormalized: normalized,
        sourceKind: input.sourceKind,
        sourceId: input.sourceId,
        approvedByAdminId: input.approvedByAdminId ?? null,
      })
      .onConflictDoNothing();

    // If another source already owns this ref, conflict unless it is us.
    const [existing] = await db
      .select()
      .from(pgApprovedTransactionRefs)
      .where(eq(pgApprovedTransactionRefs.transactionRefNormalized, normalized))
      .limit(1);

    if (
      existing &&
      (existing.sourceKind !== input.sourceKind || existing.sourceId !== input.sourceId)
    ) {
      return { ok: false, message: approvedTransactionRefConflictMessage() };
    }
    return { ok: true };
  } catch (err) {
    if (isApprovedTransactionRefUniqueViolation(err)) {
      return { ok: false, message: approvedTransactionRefConflictMessage() };
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
}): Promise<void> {
  const normalized = normalizeTransactionRef(input.transactionRef);
  if (!normalized) return;

  try {
    await db.insert(pgApprovedTransactionRefs).values({
      transactionRefNormalized: normalized,
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      approvedByAdminId: input.approvedByAdminId ?? null,
    });
  } catch (err) {
    if (isApprovedTransactionRefUniqueViolation(err)) {
      const [existing] = await db
        .select()
        .from(pgApprovedTransactionRefs)
        .where(eq(pgApprovedTransactionRefs.transactionRefNormalized, normalized))
        .limit(1);
      if (
        existing &&
        existing.sourceKind === input.sourceKind &&
        existing.sourceId === input.sourceId
      ) {
        return;
      }
      throw new Error(approvedTransactionRefConflictMessage());
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

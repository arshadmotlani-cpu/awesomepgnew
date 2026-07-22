/**
 * Admin correction of pending payment proof amounts — historical recovery only.
 * Freezes proof_snapshot_submitted_paise from admin-verified screenshot amount.
 */

import { eq } from 'drizzle-orm';
import { writeAuditLogNonBlocking } from '@/src/lib/audit/writeAuditLog';
import { isDatabaseSchemaMismatchError, schemaMismatchHint } from '@/src/lib/db/schemaMismatchError';
import { db } from '@/src/db/client';
import { bookings, pgPaymentRecords } from '@/src/db/schema';
import {
  computeMoneySlice,
  type MoneyBalanceSlice,
} from '@/src/lib/billing/bookingMoneyBalances';
import { breakdownBookingCheckoutPayment } from '@/src/lib/billing/bookingCheckoutTotals';
import { guardDepositPaise, guardPlainPaise } from '@/src/lib/deposits/paiseSafety';
import type { AdminSession } from '@/src/lib/auth/session';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminPaymentAllocationInput } from '@/src/services/qrPayments';

export type ProjectedBookingBalances = {
  rent: MoneyBalanceSlice;
  deposit: MoneyBalanceSlice;
};

export function normalizePaymentProofAllocation(
  allocation: AdminPaymentAllocationInput,
): AdminPaymentAllocationInput {
  return {
    ...allocation,
    confirmedReceivedPaise: guardPlainPaise(
      allocation.confirmedReceivedPaise,
      'correction.confirmedReceived',
    ),
    rentAllocatedPaise: guardPlainPaise(allocation.rentAllocatedPaise, 'correction.rentAllocated'),
    depositAllocatedPaise: guardPlainPaise(
      allocation.depositAllocatedPaise,
      'correction.depositAllocated',
    ),
    electricityAllocatedPaise: guardPlainPaise(
      allocation.electricityAllocatedPaise ?? 0,
      'correction.electricityAllocated',
    ),
    otherAllocatedPaise: guardPlainPaise(
      allocation.otherAllocatedPaise ?? 0,
      'correction.otherAllocated',
    ),
  };
}

export function projectBalancesAfterAllocation(input: {
  rentRequiredPaise: number;
  depositRequiredPaise: number;
  rentAllocatedPaise: number;
  depositAllocatedPaise: number;
}): ProjectedBookingBalances {
  return {
    rent: computeMoneySlice(input.rentRequiredPaise, input.rentAllocatedPaise),
    deposit: computeMoneySlice(input.depositRequiredPaise, input.depositAllocatedPaise),
  };
}

async function updatePendingProofAmount(
  tx: Pick<typeof db, 'update'>,
  input: {
    recordId: string;
    verifiedAmountPaise: number;
    snapshotColumnsAvailable: boolean;
  },
): Promise<{ submittedSnapshotUpdated: boolean }> {
  const basePatch = {
    amountPaise: input.verifiedAmountPaise,
    updatedAt: new Date(),
  };

  if (!input.snapshotColumnsAvailable) {
    await tx
      .update(pgPaymentRecords)
      .set(basePatch)
      .where(eq(pgPaymentRecords.id, input.recordId));
    return { submittedSnapshotUpdated: false };
  }

  try {
    await tx
      .update(pgPaymentRecords)
      .set({
        ...basePatch,
        proofSnapshotSubmittedPaise: input.verifiedAmountPaise,
      })
      .where(eq(pgPaymentRecords.id, input.recordId));
    return { submittedSnapshotUpdated: true };
  } catch (err) {
    if (!isDatabaseSchemaMismatchError(err)) throw err;
    console.error(
      '[payment-review] correction write failed — snapshot column missing',
      schemaMismatchHint(err),
    );
    await tx
      .update(pgPaymentRecords)
      .set(basePatch)
      .where(eq(pgPaymentRecords.id, input.recordId));
    return { submittedSnapshotUpdated: false };
  }
}

async function readBackCorrectedProofAmount(recordId: string): Promise<{
  amountPaise: number;
  proofSnapshotSubmittedPaise: number | null;
  snapshotColumnsAvailable: boolean;
}> {
  try {
    const [row] = await db
      .select({
        amountPaise: pgPaymentRecords.amountPaise,
        proofSnapshotSubmittedPaise: pgPaymentRecords.proofSnapshotSubmittedPaise,
      })
      .from(pgPaymentRecords)
      .where(eq(pgPaymentRecords.id, recordId))
      .limit(1);
    if (!row) {
      return { amountPaise: 0, proofSnapshotSubmittedPaise: null, snapshotColumnsAvailable: true };
    }
    return {
      amountPaise: guardPlainPaise(row.amountPaise, 'correction.readBackAmount'),
      proofSnapshotSubmittedPaise:
        row.proofSnapshotSubmittedPaise == null
          ? null
          : guardPlainPaise(row.proofSnapshotSubmittedPaise, 'correction.readBackSubmitted'),
      snapshotColumnsAvailable: true,
    };
  } catch (err) {
    if (!isDatabaseSchemaMismatchError(err)) throw err;
    const [row] = await db
      .select({ amountPaise: pgPaymentRecords.amountPaise })
      .from(pgPaymentRecords)
      .where(eq(pgPaymentRecords.id, recordId))
      .limit(1);
    return {
      amountPaise: row ? guardPlainPaise(row.amountPaise, 'correction.readBackAmount') : 0,
      proofSnapshotSubmittedPaise: null,
      snapshotColumnsAvailable: false,
    };
  }
}

export async function correctPendingPaymentProofAmount(input: {
  recordId: string;
  verifiedAmountPaise: number;
  adminId: string;
  reason?: string;
}): Promise<
  | { ok: true; previousAmountPaise: number; verifiedAmountPaise: number }
  | { ok: false; reason: string }
> {
  const verifiedAmountPaise = guardPlainPaise(
    input.verifiedAmountPaise,
    'correction.verifiedAmount',
  );
  if (verifiedAmountPaise <= 0) {
    return { ok: false, reason: 'Verified proof amount must be greater than zero.' };
  }

  let record:
    | {
        id: string;
        pgId: string;
        bookingId: string | null;
        status: string;
        amountPaise: number;
        proofSnapshotSubmittedPaise: number | null;
      }
    | undefined;
  let snapshotColumnsAvailable = true;

  try {
    [record] = await db
      .select({
        id: pgPaymentRecords.id,
        pgId: pgPaymentRecords.pgId,
        bookingId: pgPaymentRecords.bookingId,
        status: pgPaymentRecords.status,
        amountPaise: pgPaymentRecords.amountPaise,
        proofSnapshotSubmittedPaise: pgPaymentRecords.proofSnapshotSubmittedPaise,
      })
      .from(pgPaymentRecords)
      .where(eq(pgPaymentRecords.id, input.recordId))
      .limit(1);
  } catch (err) {
    if (!isDatabaseSchemaMismatchError(err)) throw err;
    console.error('[payment-review] correction read failed — snapshot column missing', schemaMismatchHint(err));
    snapshotColumnsAvailable = false;
    const [legacyRecord] = await db
      .select({
        id: pgPaymentRecords.id,
        pgId: pgPaymentRecords.pgId,
        bookingId: pgPaymentRecords.bookingId,
        status: pgPaymentRecords.status,
        amountPaise: pgPaymentRecords.amountPaise,
      })
      .from(pgPaymentRecords)
      .where(eq(pgPaymentRecords.id, input.recordId))
      .limit(1);
    record = legacyRecord
      ? { ...legacyRecord, proofSnapshotSubmittedPaise: null }
      : undefined;
  }

  if (!record) return { ok: false, reason: 'Payment record not found.' };
  if (record.status !== 'pending') {
    return { ok: false, reason: 'Only pending payment proofs can be corrected.' };
  }
  if (!record.bookingId) {
    return { ok: false, reason: 'Booking checkout proof required for amount correction.' };
  }

  const previousAmountPaise = guardPlainPaise(record.amountPaise, 'correction.previousAmount');
  const previousSubmittedPaise =
    record.proofSnapshotSubmittedPaise == null
      ? null
      : guardPlainPaise(record.proofSnapshotSubmittedPaise, 'correction.previousSubmitted');

  let submittedSnapshotUpdated = false;

  await db.transaction(async (tx) => {
    const writeResult = await updatePendingProofAmount(tx, {
      recordId: input.recordId,
      verifiedAmountPaise,
      snapshotColumnsAvailable,
    });
    submittedSnapshotUpdated = writeResult.submittedSnapshotUpdated;
  });

  const readBack = await readBackCorrectedProofAmount(input.recordId);
  if (readBack.amountPaise !== verifiedAmountPaise) {
    return {
      ok: false,
      reason: `Proof amount did not persist (expected ₹${(verifiedAmountPaise / 100).toFixed(0)}, got ₹${(readBack.amountPaise / 100).toFixed(0)}).`,
    };
  }
  if (
    snapshotColumnsAvailable &&
    readBack.snapshotColumnsAvailable &&
    readBack.proofSnapshotSubmittedPaise !== verifiedAmountPaise
  ) {
    return {
      ok: false,
      reason: `Submitted proof snapshot did not persist (expected ₹${(verifiedAmountPaise / 100).toFixed(0)}, got ₹${((readBack.proofSnapshotSubmittedPaise ?? 0) / 100).toFixed(0)}). Run migration 0122 or retry.`,
    };
  }
  if (snapshotColumnsAvailable && !submittedSnapshotUpdated && !readBack.snapshotColumnsAvailable) {
    console.error(
      '[payment-proof-correction] proof_snapshot_submitted_paise column unavailable — only amount_paise updated',
      schemaMismatchHint(new Error('column proof_snapshot_submitted_paise does not exist')),
    );
  }

  const auditResult = await writeAuditLogNonBlocking(db, {
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'pg_payment_record',
    entityId: input.recordId,
    action: 'proof_amount_corrected',
    diff: {
      bookingId: record.bookingId,
      previousAmountPaise,
      verifiedAmountPaise,
      previousSubmittedPaise,
      reason: input.reason ?? 'Admin verified screenshot amount',
    },
  });
  if (!auditResult.ok) {
    console.error('[payment-proof-correction] audit log failed after amount update', auditResult.error);
  }

  return {
    ok: true,
    previousAmountPaise,
    verifiedAmountPaise,
  };
}

export async function savePendingPaymentProofCorrection(
  session: AdminSession,
  input: {
    recordId: string;
    pgId: string;
    allocation: AdminPaymentAllocationInput;
  },
): Promise<
  | {
      ok: true;
      corrected: { previousAmountPaise: number; verifiedAmountPaise: number };
      projected: ProjectedBookingBalances;
      proofAmountPaise: number;
    }
  | { ok: false; message: string }
> {
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, input.pgId)) {
    return { ok: false, message: 'Access denied.' };
  }

  const allocation = normalizePaymentProofAllocation(input.allocation);

  const { validatePaymentProofAllocation } = await import(
    '@/src/services/paymentProofAllocationApproval'
  );
  const validation = validatePaymentProofAllocation(allocation);
  if (!validation.ok) return { ok: false, message: validation.reason };

  const [record] = await db
    .select({ bookingId: pgPaymentRecords.bookingId })
    .from(pgPaymentRecords)
    .where(eq(pgPaymentRecords.id, input.recordId))
    .limit(1);
  if (!record?.bookingId) {
    return { ok: false, message: 'Booking not found for this payment proof.' };
  }

  const [booking] = await db
    .select({
      subtotalPaise: bookings.subtotalPaise,
      discountPaise: bookings.discountPaise,
      depositPaise: bookings.depositPaise,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.id, record.bookingId))
    .limit(1);
  if (!booking) return { ok: false, message: 'Booking not found.' };

  const breakdown = breakdownBookingCheckoutPayment(booking);
  const depositRequired = guardDepositPaise(
    breakdown.depositCashDuePaise,
    'correction.depositRequired',
  );

  const corrected = await correctPendingPaymentProofAmount({
    recordId: input.recordId,
    verifiedAmountPaise: allocation.confirmedReceivedPaise,
    adminId: session.adminId,
    reason: allocation.allocationNotes ?? 'Admin proof correction before approval',
  });
  if (!corrected.ok) return { ok: false, message: corrected.reason };

  const projected = projectBalancesAfterAllocation({
    rentRequiredPaise: breakdown.rentDuePaise,
    depositRequiredPaise: depositRequired,
    rentAllocatedPaise: allocation.rentAllocatedPaise,
    depositAllocatedPaise: allocation.depositAllocatedPaise,
  });

  return {
    ok: true,
    corrected,
    projected,
    proofAmountPaise: corrected.verifiedAmountPaise,
  };
}

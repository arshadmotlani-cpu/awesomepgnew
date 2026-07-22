/**
 * Admin correction of pending payment proof amounts — historical recovery only.
 * Freezes proof_snapshot_submitted_paise from admin-verified screenshot amount.
 */

import { eq } from 'drizzle-orm';
import { isDatabaseSchemaMismatchError, schemaMismatchHint } from '@/src/lib/db/schemaMismatchError';
import { db } from '@/src/db/client';
import { auditLog, bookings, pgPaymentRecords } from '@/src/db/schema';
import {
  computeMoneySlice,
  type MoneyBalanceSlice,
} from '@/src/lib/billing/bookingMoneyBalances';
import { breakdownBookingCheckoutPayment } from '@/src/lib/billing/bookingCheckoutTotals';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import type { AdminSession } from '@/src/lib/auth/session';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminPaymentAllocationInput } from '@/src/services/qrPayments';

export type ProjectedBookingBalances = {
  rent: MoneyBalanceSlice;
  deposit: MoneyBalanceSlice;
};

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

export async function correctPendingPaymentProofAmount(input: {
  recordId: string;
  verifiedAmountPaise: number;
  adminId: string;
  reason?: string;
}): Promise<
  | { ok: true; previousAmountPaise: number; verifiedAmountPaise: number }
  | { ok: false; reason: string }
> {
  if (input.verifiedAmountPaise <= 0) {
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

  const previousAmountPaise = record.amountPaise;

  await db
    .update(pgPaymentRecords)
    .set(
      snapshotColumnsAvailable
        ? {
            amountPaise: input.verifiedAmountPaise,
            proofSnapshotSubmittedPaise: input.verifiedAmountPaise,
            updatedAt: new Date(),
          }
        : {
            amountPaise: input.verifiedAmountPaise,
            updatedAt: new Date(),
          },
    )
    .where(eq(pgPaymentRecords.id, input.recordId));

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'pg_payment_record',
    entityId: input.recordId,
    action: 'proof_amount_corrected',
    diff: {
      bookingId: record.bookingId,
      previousAmountPaise,
      verifiedAmountPaise: input.verifiedAmountPaise,
      previousSubmittedPaise: record.proofSnapshotSubmittedPaise,
      reason: input.reason ?? 'Admin verified screenshot amount',
    },
  });

  return {
    ok: true,
    previousAmountPaise,
    verifiedAmountPaise: input.verifiedAmountPaise,
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
    }
  | { ok: false; message: string }
> {
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, input.pgId)) {
    return { ok: false, message: 'Access denied.' };
  }

  const { validatePaymentProofAllocation } = await import(
    '@/src/services/paymentProofAllocationApproval'
  );
  const validation = validatePaymentProofAllocation(input.allocation);
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
    verifiedAmountPaise: input.allocation.confirmedReceivedPaise,
    adminId: session.adminId,
    reason: input.allocation.allocationNotes ?? 'Admin proof correction before approval',
  });
  if (!corrected.ok) return { ok: false, message: corrected.reason };

  const projected = projectBalancesAfterAllocation({
    rentRequiredPaise: breakdown.rentDuePaise,
    depositRequiredPaise: depositRequired,
    rentAllocatedPaise: input.allocation.rentAllocatedPaise,
    depositAllocatedPaise: input.allocation.depositAllocatedPaise,
  });

  return { ok: true, corrected, projected };
}

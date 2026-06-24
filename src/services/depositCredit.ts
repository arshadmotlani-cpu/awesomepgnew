import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bookings, checkoutSettlements, depositLedger } from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import {
  getDepositSummaryForBooking,
  recordDepositCollected,
} from '@/src/services/deposits';
import { applyDepositDeduction } from '@/src/services/depositSettlement';
import { resolveBookingDepositCreditAppliedPaise } from '@/src/lib/billing/bookingCheckoutTotals';

export type DepositCreditSummary = {
  totalCollectedPaise: number;
  totalHeldPaise: number;
  totalUsedPaise: number;
  totalRefundedPaise: number;
  availableCreditPaise: number;
  byBooking: Array<{
    bookingId: string;
    collectedPaise: number;
    deductedPaise: number;
    refundedPaise: number;
    availablePaise: number;
  }>;
};

/** Aggregate deposit wallet credit for a customer across confirmed bookings. */
export async function getCustomerDepositCredit(
  customerId: string,
): Promise<DepositCreditSummary> {
  const bookingRows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      sql`${bookings.customerId} = ${customerId} AND ${bookings.status} IN ('confirmed', 'completed')`,
    );

  const byBooking: DepositCreditSummary['byBooking'] = [];
  let totalCollected = 0;
  let totalUsed = 0;
  let totalRefunded = 0;
  let available = 0;

  for (const b of bookingRows) {
    const summary = await getDepositSummaryForBooking(b.id);
    if (!summary) continue;
    byBooking.push({
      bookingId: b.id,
      collectedPaise: summary.collectedPaise,
      deductedPaise: summary.deductedPaise,
      refundedPaise: summary.refundedPaise,
      availablePaise: summary.refundableBalancePaise,
    });
    totalCollected += summary.collectedPaise;
    totalUsed += summary.deductedPaise;
    totalRefunded += summary.refundedPaise;
    available += summary.refundableBalancePaise;
  }

  return {
    totalCollectedPaise: totalCollected,
    totalHeldPaise: totalCollected - totalUsed - totalRefunded,
    totalUsedPaise: totalUsed,
    totalRefundedPaise: totalRefunded,
    availableCreditPaise: available,
    byBooking,
  };
}

/** How much additional deposit to collect given existing credit. */
export function computeDepositDue(requiredPaise: number, availableCreditPaise: number): {
  requiredPaise: number;
  creditAppliedPaise: number;
  additionalDuePaise: number;
} {
  const creditAppliedPaise = Math.min(requiredPaise, Math.max(0, availableCreditPaise));
  return {
    requiredPaise,
    creditAppliedPaise,
    additionalDuePaise: Math.max(0, requiredPaise - creditAppliedPaise),
  };
}

export const DEPOSIT_CREDIT_REASON = 'Deposit credit applied from prior stay wallet';

/**
 * Move deposit credit from prior confirmed bookings onto a new booking.
 * Idempotent — skips if credit was already applied to the target booking.
 */
export async function applyDepositCreditToBooking(input: {
  customerId: string;
  targetBookingId: string;
  creditPaise: number;
  /** Admin transfer: deduct only from this source booking. */
  sourceBookingId?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.creditPaise <= 0) return { ok: true };

  const [existing] = await db
    .select({ id: depositLedger.id })
    .from(depositLedger)
    .where(
      and(
        eq(depositLedger.bookingId, input.targetBookingId),
        eq(depositLedger.entryKind, 'collected'),
        eq(depositLedger.reason, DEPOSIT_CREDIT_REASON),
      ),
    )
    .limit(1);
  if (existing) return { ok: true };

  const wallet = await getCustomerDepositCredit(input.customerId);
  let remaining = input.creditPaise;

  const sources = input.sourceBookingId
    ? wallet.byBooking.filter(
        (b) => b.bookingId === input.sourceBookingId && b.availablePaise > 0,
      )
    : wallet.byBooking
        .filter((b) => b.bookingId !== input.targetBookingId && b.availablePaise > 0)
        .sort((a, b) => b.availablePaise - a.availablePaise);

  if (input.sourceBookingId && sources.length === 0) {
    return { ok: false, error: 'Source booking has no refundable deposit available.' };
  }

  for (const source of sources) {
    if (remaining <= 0) break;
    const slice = Math.min(remaining, source.availablePaise);
    const deducted = await applyDepositDeduction({
      bookingId: source.bookingId,
      customerId: input.customerId,
      amountPaise: slice,
      reason: `Deposit credit transferred to booking ${input.targetBookingId}`,
    });
    if (!deducted.ok) {
      return { ok: false, error: deducted.error };
    }
    remaining -= slice;
  }

  if (remaining > 0) {
    return { ok: false, error: 'Insufficient deposit credit at payment time' };
  }

  await recordDepositCollected({
    bookingId: input.targetBookingId,
    customerId: input.customerId,
    amountPaise: input.creditPaise,
    reason: DEPOSIT_CREDIT_REASON,
  });

  return { ok: true };
}

export type PriorBookingDepositStatus = 'pending_refund' | 'refunded' | 'transferred';

export type PriorBookingDepositInfo = {
  bookingId: string;
  bookingCode: string | null;
  refundablePaise: number;
  status: PriorBookingDepositStatus;
  statusLabel: string;
};

function priorDepositStatusLabel(status: PriorBookingDepositStatus): string {
  switch (status) {
    case 'pending_refund':
      return 'Pending refund';
    case 'refunded':
      return 'Refunded';
    case 'transferred':
      return 'Transferred';
  }
}

async function resolvePriorBookingDepositStatus(
  bookingId: string,
  summary: Awaited<ReturnType<typeof getDepositSummaryForBooking>>,
): Promise<PriorBookingDepositStatus> {
  if (!summary) return 'pending_refund';

  const hasTransferOut = summary.entries.some(
    (e) =>
      e.entryKind === 'deducted' &&
      typeof e.reason === 'string' &&
      e.reason.includes('Deposit credit transferred to booking'),
  );
  if (hasTransferOut && summary.refundableBalancePaise <= 0) {
    return 'transferred';
  }

  const [settlement] = await db
    .select({ status: checkoutSettlements.status })
    .from(checkoutSettlements)
    .where(
      and(eq(checkoutSettlements.bookingId, bookingId), ne(checkoutSettlements.status, 'archived')),
    )
    .limit(1);

  if (
    settlement &&
    (settlement.status === 'refund_pending' || settlement.status === 'awaiting_admin_review')
  ) {
    return 'pending_refund';
  }
  if (settlement?.status === 'refund_paid' || summary.refundedPaise > 0) {
    return 'refunded';
  }
  if (hasTransferOut) {
    return 'transferred';
  }
  if (summary.refundableBalancePaise > 0) {
    return 'pending_refund';
  }
  return 'refunded';
}

/** Informational prior-booking deposit rows for admin payment review (does not reduce due). */
export async function listPriorBookingDepositsForReview(
  customerId: string,
  excludeBookingId?: string | null,
): Promise<PriorBookingDepositInfo[]> {
  const bookingRows = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
    })
    .from(bookings)
    .where(
      sql`${bookings.customerId} = ${customerId} AND ${bookings.status} IN ('confirmed', 'completed')`,
    );

  const rows: PriorBookingDepositInfo[] = [];
  for (const b of bookingRows) {
    if (excludeBookingId && b.id === excludeBookingId) continue;
    const summary = await getDepositSummaryForBooking(b.id);
    if (!summary || summary.collectedPaise <= 0) continue;

    const status = await resolvePriorBookingDepositStatus(b.id, summary);
    const refundablePaise =
      status === 'transferred' || status === 'refunded'
        ? summary.refundableBalancePaise
        : Math.max(summary.refundableBalancePaise, summary.collectedPaise - summary.refundedPaise);

    if (refundablePaise <= 0 && status === 'refunded') {
      rows.push({
        bookingId: b.id,
        bookingCode: b.bookingCode,
        refundablePaise: summary.refundedPaise > 0 ? summary.refundedPaise : summary.collectedPaise,
        status,
        statusLabel: priorDepositStatusLabel(status),
      });
      continue;
    }
    if (refundablePaise <= 0 && status !== 'transferred') continue;

    rows.push({
      bookingId: b.id,
      bookingCode: b.bookingCode,
      refundablePaise: Math.max(refundablePaise, summary.refundableBalancePaise),
      status,
      statusLabel: priorDepositStatusLabel(status),
    });
  }

  return rows.sort((a, b) => b.refundablePaise - a.refundablePaise);
}

export async function stampAdminDepositCreditOnBooking(input: {
  targetBookingId: string;
  creditPaise: number;
  sourceBookingId: string;
  sourceBookingCode?: string | null;
  adminId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [booking] = await db
    .select({
      depositPaise: bookings.depositPaise,
      totalPaise: bookings.totalPaise,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.id, input.targetBookingId))
    .limit(1);
  if (!booking) return { ok: false, error: 'Target booking not found.' };

  const appliedPaise = Math.min(booking.depositPaise, input.creditPaise);
  const snapshot = (booking.pricingSnapshot ?? {}) as PricingSnapshot;
  const prevApplied = resolveBookingDepositCreditAppliedPaise(snapshot.depositCredit);
  const creditDelta = appliedPaise - prevApplied;
  snapshot.depositCredit = {
    requiredPaise: booking.depositPaise,
    appliedPaise,
    additionalDuePaise: Math.max(0, booking.depositPaise - appliedPaise),
    appliedAt: new Date().toISOString(),
    adminTransferred: true,
    sourceBookingId: input.sourceBookingId,
    sourceBookingCode: input.sourceBookingCode ?? undefined,
    transferredByAdminId: input.adminId,
  };

  await db
    .update(bookings)
    .set({
      pricingSnapshot: snapshot,
      totalPaise: Math.max(0, booking.totalPaise - creditDelta),
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, input.targetBookingId));

  return { ok: true };
}

/** Admin-only: transfer refundable deposit from a prior booking onto a new booking. */
export async function transferOldDepositAdmin(input: {
  targetBookingId: string;
  sourceBookingId: string;
  creditPaise: number;
  adminId: string;
  reason: string;
}): Promise<{ ok: true; creditAppliedPaise: number } | { ok: false; error: string }> {
  if (input.creditPaise <= 0) {
    return { ok: false, error: 'Transfer amount must be greater than zero.' };
  }
  if (input.targetBookingId === input.sourceBookingId) {
    return { ok: false, error: 'Source and target booking must differ.' };
  }

  const [target] = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      depositPaise: bookings.depositPaise,
      status: bookings.status,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.id, input.targetBookingId))
    .limit(1);
  if (!target) return { ok: false, error: 'Target booking not found.' };
  if (!['pending_payment', 'pending_approval', 'confirmed'].includes(target.status)) {
    return { ok: false, error: 'Deposit transfer is only allowed on active bookings.' };
  }

  const snapshot = target.pricingSnapshot as PricingSnapshot | null;
  const alreadyApplied = snapshot?.depositCredit?.adminTransferred
    ? (snapshot.depositCredit.appliedPaise ?? 0)
    : 0;
  const remainingCapacity = Math.max(0, target.depositPaise - alreadyApplied);
  const creditPaise = Math.min(input.creditPaise, remainingCapacity);
  if (creditPaise <= 0) {
    return { ok: false, error: 'Target booking deposit is already fully covered.' };
  }

  const [source] = await db
    .select({ bookingCode: bookings.bookingCode })
    .from(bookings)
    .where(eq(bookings.id, input.sourceBookingId))
    .limit(1);
  if (!source) return { ok: false, error: 'Source booking not found.' };

  const creditResult = await applyDepositCreditToBooking({
    customerId: target.customerId,
    targetBookingId: target.id,
    creditPaise,
    sourceBookingId: input.sourceBookingId,
  });
  if (!creditResult.ok) return creditResult;

  const totalApplied = alreadyApplied + creditPaise;
  const stamp = await stampAdminDepositCreditOnBooking({
    targetBookingId: target.id,
    creditPaise: totalApplied,
    sourceBookingId: input.sourceBookingId,
    sourceBookingCode: source.bookingCode,
    adminId: input.adminId,
  });
  if (!stamp.ok) return stamp;

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'booking',
    entityId: target.id,
    action: 'deposit_transfer_from_prior_booking',
    diff: {
      reason: input.reason,
      sourceBookingId: input.sourceBookingId,
      sourceBookingCode: source.bookingCode,
      targetBookingCode: target.bookingCode,
      creditAppliedPaise: creditPaise,
      totalCreditOnTargetPaise: totalApplied,
    },
  });

  return { ok: true, creditAppliedPaise: creditPaise };
}

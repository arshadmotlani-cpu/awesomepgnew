/**
 * Idempotent correction for room-change wallet surplus under-credits caused by stale
 * pricingSnapshot oldMonthlyRentPaise (paid-month basis must use invoiced rent SSOT).
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bookings, customers, residentCreditLedger, roomChangeRequests } from '@/src/db/schema';
import { firstOfMonth } from '@/src/services/billing';
import {
  recomputeRoomChangeWalletSurplusFromFacts,
  type RoomShiftQuoteSnapshot,
} from '@/src/services/roomShiftQuote';
import {
  ROOM_CHANGE_CREDIT_REASON_PREFIX,
} from '@/src/services/roomTransferBilling';
export const ROOM_CHANGE_UNUSED_RENT_RECON_REASON = (requestId: string) =>
  `room_change_unused_rent_reconciliation:${requestId}`;

function originalSurplusReason(requestId: string): string {
  return `${ROOM_CHANGE_CREDIT_REASON_PREFIX}${requestId}:surplus`;
}

async function sumResidentCreditForExactReason(
  customerId: string,
  reason: string,
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${residentCreditLedger.amountPaise}), 0)::bigint::int`,
    })
    .from(residentCreditLedger)
    .where(
      and(
        eq(residentCreditLedger.customerId, customerId),
        eq(residentCreditLedger.entryKind, 'credit'),
        eq(residentCreditLedger.reason, reason),
      ),
    );
  return Math.max(0, row?.total ?? 0);
}

export type RoomChangeUnusedRentReconPreviewRow = {
  requestId: string;
  bookingId: string;
  bookingCode: string | null;
  customerId: string;
  customerName: string | null;
  shiftDate: string;
  billingMonth: string;
  fromBedId: string;
  toBedId: string;
  quoteOldRentPaise: number;
  basisOldRentPaise: number;
  basisSource: string;
  paidPrincipalPaise: number;
  newMonthlyRentPaise: number;
  postedSurplusPaise: number;
  correctSurplusPaise: number;
  correctionPaise: number;
  alreadyReconciledPaise: number;
  needsCorrection: boolean;
};

export async function previewRoomChangeUnusedRentReconciliation(input?: {
  requestId?: string;
}): Promise<RoomChangeUnusedRentReconPreviewRow[]> {
  const conditions = [eq(roomChangeRequests.status, 'completed')];
  if (input?.requestId) {
    conditions.push(eq(roomChangeRequests.id, input.requestId));
  }

  const rows = await db
    .select({
      requestId: roomChangeRequests.id,
      bookingId: roomChangeRequests.bookingId,
      customerId: roomChangeRequests.customerId,
      fromBedId: roomChangeRequests.fromBedId,
      toBedId: roomChangeRequests.toBedId,
      quoteSnapshot: roomChangeRequests.quoteSnapshot,
    })
    .from(roomChangeRequests)
    .where(and(...conditions));

  const previews: RoomChangeUnusedRentReconPreviewRow[] = [];

  for (const row of rows) {
    const quote = row.quoteSnapshot as RoomShiftQuoteSnapshot;
    if (!quote?.shiftDate) continue;

    const facts = await recomputeRoomChangeWalletSurplusFromFacts({
      bookingId: row.bookingId,
      fromBedId: row.fromBedId,
      toBedId: row.toBedId,
      shiftDate: quote.shiftDate,
      depositHeldPaise: quote.depositHeldPaise ?? 0,
      snapshotFallbackOldRentPaise: quote.oldMonthlyRentPaise,
      shiftFeePaise: quote.shiftFeePaise,
      depositTopUpPaise: quote.depositDeltaPaise,
    });

    const postedSurplus = quote.walletSurplusPaise ?? 0;
    const correctSurplus = facts.walletSurplusPaise;

    const [customer] = await db
      .select({ fullName: customers.fullName })
      .from(customers)
      .where(eq(customers.id, row.customerId))
      .limit(1);
    const [booking] = await db
      .select({ bookingCode: bookings.bookingCode })
      .from(bookings)
      .where(eq(bookings.id, row.bookingId))
      .limit(1);

    const originalPosted = await sumResidentCreditForExactReason(
      row.customerId,
      originalSurplusReason(row.requestId),
    );
    const reconPosted = await sumResidentCreditForExactReason(
      row.customerId,
      ROOM_CHANGE_UNUSED_RENT_RECON_REASON(row.requestId),
    );
    const totalCredited = originalPosted + reconPosted;
    const correctionPaise = Math.max(0, correctSurplus - totalCredited);

    const needsCorrection = correctionPaise > 0;

    previews.push({
      requestId: row.requestId,
      bookingId: row.bookingId,
      bookingCode: booking?.bookingCode ?? null,
      customerId: row.customerId,
      customerName: customer?.fullName ?? null,
      shiftDate: quote.shiftDate,
      billingMonth: firstOfMonth(quote.shiftDate),
      fromBedId: row.fromBedId,
      toBedId: row.toBedId,
      quoteOldRentPaise: quote.oldMonthlyRentPaise,
      basisOldRentPaise: facts.basis.oldMonthlyRentPaise,
      basisSource: facts.basis.basisSource,
      paidPrincipalPaise: facts.basis.paidPrincipalPaise,
      newMonthlyRentPaise: facts.newMonthlyRentPaise,
      postedSurplusPaise: postedSurplus,
      correctSurplusPaise: correctSurplus,
      correctionPaise,
      alreadyReconciledPaise: reconPosted,
      needsCorrection,
    });
  }

  return previews.sort((a, b) => a.shiftDate.localeCompare(b.shiftDate));
}

export type RoomChangeUnusedRentReconApplyResult =
  | { ok: true; kind: 'noop'; preview: RoomChangeUnusedRentReconPreviewRow }
  | { ok: true; kind: 'reconciled'; preview: RoomChangeUnusedRentReconPreviewRow; creditId?: string }
  | { ok: false; kind: 'not_found' | 'skipped'; message: string };

export async function applyRoomChangeUnusedRentReconciliation(input: {
  requestId: string;
  dryRun?: boolean;
  adminId?: string | null;
}): Promise<RoomChangeUnusedRentReconApplyResult> {
  const [preview] = await previewRoomChangeUnusedRentReconciliation({
    requestId: input.requestId,
  });
  if (!preview) {
    return { ok: false, kind: 'not_found', message: `Room change ${input.requestId} not found.` };
  }
  if (!preview.needsCorrection || preview.correctionPaise <= 0) {
    return { ok: true, kind: 'noop', preview };
  }

  const reconReason = ROOM_CHANGE_UNUSED_RENT_RECON_REASON(input.requestId);
  const reconAlready = await sumResidentCreditForExactReason(preview.customerId, reconReason);
  if (reconAlready > 0) {
    return {
      ok: true,
      kind: 'noop',
      preview: { ...preview, correctionPaise: 0, needsCorrection: false },
    };
  }

  if (input.dryRun) {
    return { ok: true, kind: 'reconciled', preview };
  }

  await db.transaction(async (tx) => {
    await tx.insert(residentCreditLedger).values({
      customerId: preview.customerId,
      bookingId: preview.bookingId,
      entryKind: 'credit',
      amountPaise: preview.correctionPaise,
      reason: reconReason,
      createdByAdminId: input.adminId ?? null,
    });

    await tx.insert(auditLog).values({
      actorType: input.adminId ? 'admin' : 'system',
      actorId: input.adminId ?? null,
      entity: 'room_change_request',
      entityId: input.requestId,
      action: 'reconcile_room_change_unused_rent',
      diff: {
        bookingId: preview.bookingId,
        bookingCode: preview.bookingCode,
        customerId: preview.customerId,
        billingMonth: preview.billingMonth,
        shiftDate: preview.shiftDate,
        fromBedId: preview.fromBedId,
        toBedId: preview.toBedId,
        quoteOldRentPaise: preview.quoteOldRentPaise,
        basisOldRentPaise: preview.basisOldRentPaise,
        basisSource: preview.basisSource,
        paidPrincipalPaise: preview.paidPrincipalPaise,
        newMonthlyRentPaise: preview.newMonthlyRentPaise,
        postedSurplusPaise: preview.postedSurplusPaise,
        correctSurplusPaise: preview.correctSurplusPaise,
        correctionPaise: preview.correctionPaise,
        reconReason,
      },
    });
  });

  return { ok: true, kind: 'reconciled', preview };
}

export async function applyAllRoomChangeUnusedRentReconciliations(input: {
  dryRun?: boolean;
  adminId?: string | null;
}): Promise<{
  previews: RoomChangeUnusedRentReconPreviewRow[];
  results: RoomChangeUnusedRentReconApplyResult[];
}> {
  const previews = await previewRoomChangeUnusedRentReconciliation();
  const toApply = previews.filter((p) => p.needsCorrection && p.correctionPaise > 0);
  const results: RoomChangeUnusedRentReconApplyResult[] = [];
  for (const row of toApply) {
    results.push(
      await applyRoomChangeUnusedRentReconciliation({
        requestId: row.requestId,
        dryRun: input.dryRun,
        adminId: input.adminId,
      }),
    );
  }
  return { previews, results };
}

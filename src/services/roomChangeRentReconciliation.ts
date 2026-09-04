/**
 * Generic room-change September rent reconciliation.
 * Recomputes canonical rent waterfall from immutable quote inputs (not mutating snapshot).
 * Repairs unpaid financial_invoices when engine drift left rent below new-bed monthly SSOT.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, financialInvoices, roomChangeRequests } from '@/src/db/schema';
import type { InvoiceBreakdown } from '@/src/db/schema/financialInvoices';
import { firstOfMonth } from '@/src/services/billing';
import {
  ROOM_CHANGE_INVOICE_SOURCE,
  applyRoomShiftCreditWaterfall,
  settleRoomShiftRentSides,
  type RoomShiftQuoteSnapshot,
} from '@/src/services/roomShiftQuote';

export type RoomChangeRentReconciliationPreview = {
  requestId: string;
  bookingId: string;
  shiftDate: string;
  billingMonth: string;
  frozenQuoteUntouched: true;
  economicRentPaise: number;
  targetNewBedMonthlyRentPaise: number;
  oldRentDuePaise: number;
  newRentDuePaise: number;
  feeDuePaise: number;
  depositDuePaise: number;
  totalDuePaise: number;
  existing: {
    oldRentPaise: number | null;
    newRentPaise: number | null;
    payAllPaise: number | null;
  };
  needsRepair: boolean;
  mismatchReasons: string[];
};

export type RoomChangeRentReconciliationResult =
  | { ok: true; kind: 'noop' | 'repaired'; preview: RoomChangeRentReconciliationPreview }
  | { ok: false; kind: 'not_found' | 'paid_locked' | 'mismatch'; message: string; preview?: RoomChangeRentReconciliationPreview };

function recomputeFromQuoteInputs(quote: RoomShiftQuoteSnapshot): {
  oldRentDueAfterCreditPaise: number;
  newRentDuePaise: number;
  feeDuePaise: number;
  depositDuePaise: number;
  totalDuePaise: number;
  economicRentPaise: number;
} {
  const sides = settleRoomShiftRentSides({
    oldMonthlyRentPaise: quote.oldMonthlyRentPaise,
    newMonthlyRentPaise: quote.newMonthlyRentPaise,
    shiftDate: quote.shiftDate,
    currentMonthRentIsPaid: quote.currentMonthRentIsPaid,
  });
  const waterfall = applyRoomShiftCreditWaterfall({
    oldRentDuePaise: sides.oldRentDuePaise,
    newRentChargePaise: sides.newRemainderPaise,
    shiftFeePaise: quote.shiftFeePaise,
    depositTopUpPaise: quote.depositDeltaPaise,
    unusedPrepaidCreditPaise: sides.unusedPrepaidCreditPaise,
  });
  const economicRentPaise =
    waterfall.oldRentDueAfterCreditPaise + waterfall.newRentDuePaise;
  return {
    oldRentDueAfterCreditPaise: waterfall.oldRentDueAfterCreditPaise,
    newRentDuePaise: waterfall.newRentDuePaise,
    feeDuePaise: waterfall.feeDuePaise,
    depositDuePaise: waterfall.depositDuePaise,
    totalDuePaise: waterfall.totalDuePaise,
    economicRentPaise,
  };
}

async function loadInvoiceAmount(
  requestId: string,
  sourceTable: string,
): Promise<{ id: string; amountPaise: number; status: string } | null> {
  const [row] = await db
    .select({
      id: financialInvoices.id,
      amountPaise: financialInvoices.amountPaise,
      status: financialInvoices.status,
    })
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.sourceId, requestId),
        eq(financialInvoices.sourceTable, sourceTable),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function previewRoomChangeRentReconciliation(
  requestId: string,
): Promise<RoomChangeRentReconciliationPreview | null> {
  const [request] = await db
    .select({
      bookingId: roomChangeRequests.bookingId,
      quoteSnapshot: roomChangeRequests.quoteSnapshot,
      status: roomChangeRequests.status,
    })
    .from(roomChangeRequests)
    .where(eq(roomChangeRequests.id, requestId))
    .limit(1);
  if (!request?.quoteSnapshot) return null;

  const quote = request.quoteSnapshot as RoomShiftQuoteSnapshot;
  const canonical = recomputeFromQuoteInputs(quote);
  const [oldInv, newInv, payAllInv] = await Promise.all([
    loadInvoiceAmount(requestId, ROOM_CHANGE_INVOICE_SOURCE.oldRent),
    loadInvoiceAmount(requestId, ROOM_CHANGE_INVOICE_SOURCE.newRent),
    loadInvoiceAmount(requestId, ROOM_CHANGE_INVOICE_SOURCE.payAll),
  ]);

  const mismatchReasons: string[] = [];
  if (oldInv && oldInv.amountPaise !== canonical.oldRentDueAfterCreditPaise) {
    mismatchReasons.push(
      `old rent invoice ${oldInv.amountPaise} ≠ canonical ${canonical.oldRentDueAfterCreditPaise}`,
    );
  }
  if (newInv && newInv.amountPaise !== canonical.newRentDuePaise) {
    mismatchReasons.push(
      `new rent invoice ${newInv.amountPaise} ≠ canonical ${canonical.newRentDuePaise}`,
    );
  }
  if (payAllInv && payAllInv.amountPaise !== canonical.totalDuePaise) {
    mismatchReasons.push(
      `pay-all invoice ${payAllInv.amountPaise} ≠ canonical ${canonical.totalDuePaise}`,
    );
  }
  if (
    !quote.currentMonthRentIsPaid &&
    canonical.economicRentPaise !== quote.newMonthlyRentPaise
  ) {
    mismatchReasons.push(
      `economic rent ${canonical.economicRentPaise} should equal new-bed monthly ${quote.newMonthlyRentPaise}`,
    );
  }

  const needsRepair = mismatchReasons.some((r) => r.includes('invoice'));

  return {
    requestId,
    bookingId: request.bookingId,
    shiftDate: quote.shiftDate,
    billingMonth: firstOfMonth(quote.shiftDate),
    frozenQuoteUntouched: true,
    economicRentPaise: canonical.economicRentPaise,
    targetNewBedMonthlyRentPaise: quote.newMonthlyRentPaise,
    oldRentDuePaise: canonical.oldRentDueAfterCreditPaise,
    newRentDuePaise: canonical.newRentDuePaise,
    feeDuePaise: canonical.feeDuePaise,
    depositDuePaise: canonical.depositDuePaise,
    totalDuePaise: canonical.totalDuePaise,
    existing: {
      oldRentPaise: oldInv?.amountPaise ?? null,
      newRentPaise: newInv?.amountPaise ?? null,
      payAllPaise: payAllInv?.amountPaise ?? null,
    },
    needsRepair,
    mismatchReasons,
  };
}

export async function reconcileRoomChangeRentInvoices(input: {
  requestId: string;
  dryRun?: boolean;
  adminId?: string | null;
}): Promise<RoomChangeRentReconciliationResult> {
  const preview = await previewRoomChangeRentReconciliation(input.requestId);
  if (!preview) {
    return { ok: false, kind: 'not_found', message: `Room change ${input.requestId} not found.` };
  }
  if (!preview.needsRepair) {
    return { ok: true, kind: 'noop', preview };
  }

  const invoices = await db
    .select({
      id: financialInvoices.id,
      sourceTable: financialInvoices.sourceTable,
      amountPaise: financialInvoices.amountPaise,
      status: financialInvoices.status,
      breakdown: financialInvoices.breakdown,
    })
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.sourceId, input.requestId),
        inArray(financialInvoices.sourceTable, [
          ROOM_CHANGE_INVOICE_SOURCE.oldRent,
          ROOM_CHANGE_INVOICE_SOURCE.newRent,
          ROOM_CHANGE_INVOICE_SOURCE.payAll,
        ]),
      ),
    );

  const paidLocked = invoices.some(
    (inv) =>
      (inv.status === 'paid' || inv.status === 'settled') &&
      (inv.sourceTable === ROOM_CHANGE_INVOICE_SOURCE.newRent ||
        inv.sourceTable === ROOM_CHANGE_INVOICE_SOURCE.oldRent),
  );
  if (paidLocked) {
    return {
      ok: false,
      kind: 'paid_locked',
      message: 'Cannot adjust room-change rent invoices after payment.',
      preview,
    };
  }

  if (input.dryRun) {
    return { ok: true, kind: 'repaired', preview };
  }

  await db.transaction(async (tx) => {
    for (const inv of invoices) {
      if (inv.status === 'paid' || inv.status === 'cancelled' || inv.status === 'refunded') {
        continue;
      }
      let nextAmount: number | null = null;
      if (inv.sourceTable === ROOM_CHANGE_INVOICE_SOURCE.oldRent) {
        nextAmount = preview.oldRentDuePaise;
      } else if (inv.sourceTable === ROOM_CHANGE_INVOICE_SOURCE.newRent) {
        nextAmount = preview.newRentDuePaise;
      } else if (inv.sourceTable === ROOM_CHANGE_INVOICE_SOURCE.payAll) {
        nextAmount = preview.totalDuePaise;
      }
      if (nextAmount == null || nextAmount === inv.amountPaise) continue;

      const breakdown: InvoiceBreakdown = {
        ...(inv.breakdown ?? {}),
        rentPaise:
          inv.sourceTable === ROOM_CHANGE_INVOICE_SOURCE.payAll
            ? preview.oldRentDuePaise + preview.newRentDuePaise
            : nextAmount,
      };
      await tx
        .update(financialInvoices)
        .set({
          amountPaise: nextAmount,
          breakdown,
          updatedAt: new Date(),
        })
        .where(eq(financialInvoices.id, inv.id));
    }

    await tx.insert(auditLog).values({
      actorType: input.adminId ? 'admin' : 'system',
      actorId: input.adminId ?? null,
      entity: 'room_change_request',
      entityId: input.requestId,
      action: 'reconcile_room_change_rent_invoices',
      diff: {
        billingMonth: preview.billingMonth,
        economicRentPaise: preview.economicRentPaise,
        oldRentDuePaise: preview.oldRentDuePaise,
        newRentDuePaise: preview.newRentDuePaise,
        totalDuePaise: preview.totalDuePaise,
        previous: preview.existing,
        frozenQuoteUntouched: true,
      },
    });
  });

  const refreshed = await previewRoomChangeRentReconciliation(input.requestId);
  return { ok: true, kind: 'repaired', preview: refreshed ?? preview };
}

/**
 * Resident Exit Brain — lightweight lifecycle loader for guards and services.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { checkoutSettlements, vacatingRequests } from '@/src/db/schema';
import { getExitBrainForBooking } from '@/src/lib/exit/activateResidentExitBrain';
import type { ExitBrainLifecycle } from '@/src/lib/exit/exitBrainStateMachine';
import {
  buildExitBrainLifecycle,
  projectionInputToStateMachineInput,
} from '@/src/lib/exit/exitBrainStateMachine';
import { canRequestMoveOutRefund } from '@/src/lib/residents/vacatingJourney';

export async function loadExitBrainLifecycleForBooking(
  bookingId: string,
): Promise<ExitBrainLifecycle> {
  const [exitRow, vacatingRow, settlement] = await Promise.all([
    getExitBrainForBooking(bookingId),
    db
      .select({
        status: vacatingRequests.status,
        vacatingDate: vacatingRequests.vacatingDate,
        checkoutSettlementSuppressed: vacatingRequests.checkoutSettlementSuppressed,
      })
      .from(vacatingRequests)
      .where(eq(vacatingRequests.bookingId, bookingId))
      .orderBy(sql`${vacatingRequests.createdAt} DESC`)
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        status: checkoutSettlements.status,
        electricityMeterPhotoUrl: checkoutSettlements.electricityMeterPhotoUrl,
        meterPhotoMissing: checkoutSettlements.meterPhotoMissing,
        electricitySharePaise: checkoutSettlements.electricitySharePaise,
        payoutUpiId: checkoutSettlements.payoutUpiId,
        payoutQrUrl: checkoutSettlements.payoutQrUrl,
        refundPaidAt: checkoutSettlements.refundPaidAt,
      })
      .from(checkoutSettlements)
      .where(
        and(
          eq(checkoutSettlements.bookingId, bookingId),
          sql`${checkoutSettlements.status} <> 'archived'`,
        ),
      )
      .orderBy(sql`${checkoutSettlements.updatedAt} DESC`)
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  const hasMeterPhoto = Boolean(settlement?.electricityMeterPhotoUrl?.trim());
  const hasPayoutDetails = Boolean(
    settlement?.payoutUpiId?.trim() || settlement?.payoutQrUrl?.trim(),
  );
  const electricityEstimatedPending =
    !settlement?.electricitySharePaise || settlement.electricitySharePaise <= 0;

  const refundGate = canRequestMoveOutRefund({
    vacatingStatus: vacatingRow?.status ?? null,
    vacatingDate: vacatingRow?.vacatingDate ? String(vacatingRow.vacatingDate) : null,
    checkoutStatus: settlement?.status ?? null,
    checkoutSettlementSuppressed: vacatingRow?.checkoutSettlementSuppressed ?? false,
  });

  const projection = {
    vacatingStatus: vacatingRow?.status ?? null,
    exitBrainStatus: exitRow?.status ?? null,
    settlementStatus: settlement?.status ?? null,
    hasMeterPhoto,
    meterPhotoMissing: settlement?.meterPhotoMissing ?? false,
    electricitySharePaise: settlement?.electricitySharePaise ?? null,
    electricityEstimatedPending,
    refundPaidAt: settlement?.refundPaidAt ?? null,
    hasPayoutDetails,
  };

  return buildExitBrainLifecycle(
    projectionInputToStateMachineInput(projection, {
      hasSettlement: settlement != null,
      refundRequestEligible: refundGate.allowed,
    }),
  );
}

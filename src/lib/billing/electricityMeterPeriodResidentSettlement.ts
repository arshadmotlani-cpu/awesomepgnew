/**
 * Meter-period electricity allocation → per-resident settlement (deposit vs dues).
 * Read/preview safe; financial writes happen in createElectricityBill.
 */
import type { MonthlyElectricityAllocationResult } from '@/src/lib/billing/roomElectricityMonthlyAllocation';
import type { RoomElectricityOccupantRow } from '@/src/lib/billing/roomElectricityOccupants';
import type { VerifiedPriorCollectionsLoadResult } from '@/src/lib/billing/electricityVerifiedPriorCollections';
import { priorCollectionBelongsToOpenMeterPeriod } from '@/src/lib/billing/electricityPriorCollectionMeterPeriodAttribution';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { db } from '@/src/db/client';
import { and, eq, sql } from 'drizzle-orm';
import {
  bedReservations,
  beds,
  bookings,
  checkoutSettlements,
  depositLedger,
  vacatingRequests,
} from '@/src/db/schema';

const CHECKOUT_ELECTRICITY_REASON = 'Electricity share at checkout';
const METER_PERIOD_ELECTRICITY_DEPOSIT_REASON = 'Room electricity — meter period allocation';

export type ElectricityResidentSettlementCategory =
  | 'already_settled'
  | 'settled_from_deposit'
  | 'outstanding_dues'
  | 'no_amount_due';

export type ElectricityResidentSettlementLine = {
  customerId: string;
  customerName: string;
  bookingId: string;
  occupancyStart: string;
  occupancyEnd: string;
  occupancyDays: number;
  grossAllocationPaise: number;
  previouslyCollectedPaise: number;
  checkoutElectricitySettledPaise: number;
  refundableBalanceBeforePaise: number;
  depositElectricityDeductionPaise: number;
  newDuesPaise: number;
  remainingRefundableBalancePaise: number;
  remainingElectricityPaise: number;
  category: ElectricityResidentSettlementCategory;
  isActiveResident: boolean;
  requiresMeterPhotoForDepositSettlement: boolean;
  settlementNotes: string[];
};

export type ElectricityRoomSettlementPreview = {
  lines: ElectricityResidentSettlementLine[];
  totals: {
    grossAllocationPaise: number;
    previouslyCollectedPaise: number;
    depositElectricityDeductionPaise: number;
    newDuesPaise: number;
    remainingElectricityPaise: number;
  };
  meterPeriodElectricityEstablished: boolean;
};

export { METER_PERIOD_ELECTRICITY_DEPOSIT_REASON };

function occupancyBounds(occupant: RoomElectricityOccupantRow): {
  start: string;
  end: string;
  days: number;
} {
  let start = occupant.intervals[0]?.startDate ?? '';
  let endExclusive = occupant.intervals[0]?.endDateExclusive ?? '';
  for (const interval of occupant.intervals) {
    if (interval.startDate && interval.startDate < start) start = interval.startDate;
    const end = interval.endDateExclusive ?? endExclusive;
    if (end && end > endExclusive) endExclusive = end;
  }
  const end = endExclusive
    ? new Date(new Date(`${endExclusive.slice(0, 10)}T12:00:00Z`).getTime() - 86_400_000)
        .toISOString()
        .slice(0, 10)
    : start;
  return {
    start,
    end,
    days: occupant.occupiedDates?.length ?? occupant.weight,
  };
}

async function isCustomerActiveInRoom(customerId: string, roomId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: bedReservations.id })
    .from(bedReservations)
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .where(
      and(
        eq(beds.roomId, roomId),
        eq(bedReservations.kind, 'primary'),
        eq(bedReservations.status, 'active'),
        eq(bookings.customerId, customerId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function loadCheckoutElectricityContext(input: {
  bookingId: string;
  roomId: string;
  periodStartDate: string;
  periodEndExclusive: string;
  previousFinalizedReadingUnits?: number | null;
}) {
  const settlements = await db
    .select({
      id: checkoutSettlements.id,
      status: checkoutSettlements.status,
      electricitySharePaise: checkoutSettlements.electricitySharePaise,
      electricityFromDepositPaise: checkoutSettlements.electricityFromDepositPaise,
      electricityPreviousReading: checkoutSettlements.electricityPreviousReading,
      electricityCurrentReading: checkoutSettlements.electricityCurrentReading,
      vacatingDate: vacatingRequests.vacatingDate,
    })
    .from(checkoutSettlements)
    .innerJoin(vacatingRequests, eq(vacatingRequests.id, checkoutSettlements.vacatingRequestId))
    .where(eq(checkoutSettlements.bookingId, input.bookingId));

  let checkoutElectricityInPeriodPaise = 0;
  let completedCheckoutInPeriod = false;
  for (const row of settlements) {
    const vacating = String(row.vacatingDate).slice(0, 10);
    const inPeriod = priorCollectionBelongsToOpenMeterPeriod({
      periodStartDate: input.periodStartDate,
      periodEndExclusive: input.periodEndExclusive,
      previousFinalizedReadingUnits: input.previousFinalizedReadingUnits,
      vacatingDate: vacating,
      checkoutMeter: {
        previousReadingUnits:
          row.electricityPreviousReading != null ? Number(row.electricityPreviousReading) : null,
        currentReadingUnits:
          row.electricityCurrentReading != null ? Number(row.electricityCurrentReading) : null,
      },
    });
    if (!inPeriod) continue;
    const amount = Math.max(
      row.electricityFromDepositPaise ?? 0,
      row.electricitySharePaise ?? 0,
    );
    checkoutElectricityInPeriodPaise += amount;
    if (row.status === 'completed') completedCheckoutInPeriod = true;
  }

  const depositRows = await db
    .select({ amountPaise: depositLedger.amountPaise })
    .from(depositLedger)
    .where(
      and(
        eq(depositLedger.bookingId, input.bookingId),
        eq(depositLedger.entryKind, 'deducted'),
        eq(depositLedger.reason, CHECKOUT_ELECTRICITY_REASON),
      ),
    );

  let depositElectricityCheckoutPaise = 0;
  for (const row of depositRows) {
    depositElectricityCheckoutPaise += Math.abs(Number(row.amountPaise));
  }

  return {
    checkoutElectricityInPeriodPaise,
    depositElectricityCheckoutPaise,
    completedCheckoutInPeriod,
    hasCheckoutSettlement: settlements.length > 0,
  };
}

export function resolveResidentElectricitySettlementLine(input: {
  occupant: RoomElectricityOccupantRow;
  bounds: { start: string; end: string; days: number };
  grossAllocationPaise: number;
  previouslyCollectedPaise: number;
  checkoutElectricitySettledPaise: number;
  completedCheckoutInPeriod: boolean;
  refundableBalancePaise: number;
  isActiveResident: boolean;
  hasCheckoutSettlement: boolean;
  meterPeriodElectricityEstablished: boolean;
}): ElectricityResidentSettlementLine {
  const notes: string[] = [];
  const gross = input.grossAllocationPaise;
  const priorCollected = Math.min(
    gross,
    input.previouslyCollectedPaise + input.checkoutElectricitySettledPaise,
  );
  let remaining = Math.max(0, gross - priorCollected);

  if (
    remaining > 0 &&
    !input.isActiveResident &&
    input.completedCheckoutInPeriod &&
    input.checkoutElectricitySettledPaise === 0 &&
    input.previouslyCollectedPaise === 0
  ) {
    notes.push(
      'Checkout completed in meter period without a separate electricity line; not re-invoicing.',
    );
    remaining = 0;
  }

  let depositDeduction = 0;
  let dues = 0;
  let category: ElectricityResidentSettlementCategory = 'no_amount_due';

  if (remaining <= 0) {
    category = priorCollected > 0 ? 'already_settled' : 'no_amount_due';
  } else if (input.isActiveResident || !input.hasCheckoutSettlement) {
    dues = remaining;
    category = 'outstanding_dues';
    notes.push(
      input.isActiveResident
        ? 'Active resident — electricity becomes normal dues.'
        : 'No checkout settlement on file — electricity becomes normal dues (not deposit deduction).',
    );
  } else if (input.refundableBalancePaise > 0) {
    depositDeduction = Math.min(remaining, input.refundableBalancePaise);
    dues = remaining - depositDeduction;
    category = depositDeduction > 0 ? 'settled_from_deposit' : 'outstanding_dues';
    if (depositDeduction > 0) {
      notes.push('Vacated resident — deduct from refundable deposit balance.');
    }
    if (dues > 0) notes.push('Deposit insufficient — remainder becomes dues.');
  } else {
    dues = remaining;
    category = 'outstanding_dues';
  }

  const remainingRefundable = Math.max(0, input.refundableBalancePaise - depositDeduction);

  return {
    customerId: input.occupant.customerId,
    customerName: input.occupant.customerName ?? 'Resident',
    bookingId: input.occupant.bookingId,
    occupancyStart: input.bounds.start,
    occupancyEnd: input.bounds.end,
    occupancyDays: input.bounds.days,
    grossAllocationPaise: gross,
    previouslyCollectedPaise: priorCollected,
    checkoutElectricitySettledPaise: input.checkoutElectricitySettledPaise,
    refundableBalanceBeforePaise: input.refundableBalancePaise,
    depositElectricityDeductionPaise: depositDeduction,
    newDuesPaise: dues,
    remainingRefundableBalancePaise: remainingRefundable,
    remainingElectricityPaise: dues,
    category,
    isActiveResident: input.isActiveResident,
    requiresMeterPhotoForDepositSettlement:
      depositDeduction > 0 && !input.meterPeriodElectricityEstablished,
    settlementNotes: notes,
  };
}

export async function buildElectricityRoomSettlementPreview(input: {
  roomId: string;
  periodStartDate: string;
  periodEndExclusive: string;
  previousFinalizedReadingUnits?: number | null;
  occupants: RoomElectricityOccupantRow[];
  allocation: MonthlyElectricityAllocationResult;
  verifiedPrior: VerifiedPriorCollectionsLoadResult;
  meterPeriodElectricityEstablished: boolean;
}): Promise<ElectricityRoomSettlementPreview> {
  const lines: ElectricityResidentSettlementLine[] = [];

  for (const occupant of input.occupants) {
    const bounds = occupancyBounds(occupant);
    const gross =
      input.allocation.calculatedShareByCustomerId.get(occupant.customerId) ?? 0;
    const contributionApplied =
      input.allocation.contributionAppliedByCustomerId.get(occupant.customerId) ?? 0;
    const verifiedPriorPaise = input.verifiedPrior.byCustomerId.get(occupant.customerId) ?? 0;
    const previouslyCollectedPaise = Math.max(contributionApplied, verifiedPriorPaise);

    const checkoutCtx = await loadCheckoutElectricityContext({
      bookingId: occupant.bookingId,
      roomId: input.roomId,
      periodStartDate: input.periodStartDate,
      periodEndExclusive: input.periodEndExclusive,
      previousFinalizedReadingUnits: input.previousFinalizedReadingUnits,
    });
    const checkoutElectricitySettledPaise = Math.max(
      checkoutCtx.checkoutElectricityInPeriodPaise,
      checkoutCtx.depositElectricityCheckoutPaise,
    );

    const deposit = await getDepositSummaryForBooking(occupant.bookingId);
    const isActive = await isCustomerActiveInRoom(occupant.customerId, input.roomId);

    lines.push(
      resolveResidentElectricitySettlementLine({
        occupant,
        bounds,
        grossAllocationPaise: gross,
        previouslyCollectedPaise,
        checkoutElectricitySettledPaise,
        completedCheckoutInPeriod: checkoutCtx.completedCheckoutInPeriod,
        refundableBalancePaise: deposit?.refundableBalancePaise ?? 0,
        isActiveResident: isActive,
        hasCheckoutSettlement: checkoutCtx.hasCheckoutSettlement,
        meterPeriodElectricityEstablished: input.meterPeriodElectricityEstablished,
      }),
    );
  }

  const totals = lines.reduce(
    (acc, line) => {
      acc.grossAllocationPaise += line.grossAllocationPaise;
      acc.previouslyCollectedPaise += Math.min(
        line.grossAllocationPaise,
        line.previouslyCollectedPaise,
      );
      acc.depositElectricityDeductionPaise += line.depositElectricityDeductionPaise;
      acc.newDuesPaise += line.newDuesPaise;
      acc.remainingElectricityPaise += line.remainingElectricityPaise;
      return acc;
    },
    {
      grossAllocationPaise: 0,
      previouslyCollectedPaise: 0,
      depositElectricityDeductionPaise: 0,
      newDuesPaise: 0,
      remainingElectricityPaise: 0,
    },
  );

  return {
    lines,
    totals,
    meterPeriodElectricityEstablished: input.meterPeriodElectricityEstablished,
  };
}

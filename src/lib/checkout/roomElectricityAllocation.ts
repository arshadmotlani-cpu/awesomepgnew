/**
 * Room-based, timeline-weighted electricity allocation for checkout.
 * Electricity belongs to the room — each resident pays only their occupancy share.
 */
import { diffDays, parseDate } from '@/src/lib/dates';
import { splitElectricityWeighted } from '@/src/services/billing';

export type RoomOccupantSlice = {
  bookingId: string;
  customerId: string;
  customerName: string;
  /** Inclusive stay start (YYYY-MM-DD). */
  stayStart: string;
  /** Exclusive stay end from stay_range upper bound, or null when open-ended. */
  stayEndExclusive: string | null;
};

export type OccupantElectricitySettlementStatus = 'paid' | 'pending' | 'estimated';

export type OccupantElectricityLine = {
  bookingId: string;
  customerId: string;
  customerName: string;
  occupancyDays: number;
  fairSharePaise: number;
  collectedPaise: number;
  settlementStatus: OccupantElectricitySettlementStatus;
  /** Share this resident would pay if checking out now (among unsettled pool). */
  checkoutSharePaise: number;
};

export type RoomElectricityCheckoutAllocation = {
  billingMonth: string;
  periodStart: string;
  periodEndExclusive: string;
  unitsConsumed: number | null;
  totalBillPaise: number;
  /** Sum of all residents' attributed collections this period (room-level). */
  alreadyCollectedPaise: number;
  remainingToRecoverPaise: number;
  /** Collections attributed to other residents in the room this period. */
  otherResidentsCollectedPaise: number;
  /** This resident's fair share for the period (occupancy-weighted). */
  currentResidentFairSharePaise: number;
  /** Electricity already attributed to this resident for this period. */
  currentResidentCollectedPaise: number;
  /** This resident's remaining checkout due (never includes others' payments). */
  currentResidentRemainingDuePaise: number;
  /** Room-level collections that exceed the bill or cannot be tied to a resident. */
  unallocatedCollectedPaise: number;
  occupants: OccupantElectricityLine[];
  currentResidentSharePaise: number;
};

/** Active person-days for one occupant within a half-open billing period. */
export function activeDaysInPeriod(
  stayStart: string,
  stayEndExclusive: string | null,
  periodStart: string,
  periodEndExclusive: string,
): number {
  const aStart = parseDate(stayStart);
  const aEnd = stayEndExclusive ? parseDate(stayEndExclusive) : parseDate(periodEndExclusive);
  const pStart = parseDate(periodStart);
  const pEnd = parseDate(periodEndExclusive);
  const intersectStart = aStart > pStart ? aStart : pStart;
  const intersectEnd = aEnd < pEnd ? aEnd : pEnd;
  if (intersectEnd <= intersectStart) return 0;
  return diffDays(intersectStart, intersectEnd);
}

/**
 * Split a room electricity bill across occupants by occupancy days, then
 * determine the current resident's checkout share from the remaining pool
 * after prior collections (never over-recover for the room).
 */
export function allocateRoomElectricityCheckout(input: {
  billingMonth: string;
  periodStart: string;
  periodEndExclusive: string;
  totalBillPaise: number;
  unitsConsumed?: number | null;
  occupants: RoomOccupantSlice[];
  collectedByCustomerId: Map<string, number>;
  currentCustomerId: string;
}): RoomElectricityCheckoutAllocation {
  const weighted = input.occupants
    .map((occupant) => ({
      occupant,
      days: activeDaysInPeriod(
        occupant.stayStart,
        occupant.stayEndExclusive,
        input.periodStart,
        input.periodEndExclusive,
      ),
    }))
    .filter((row) => row.days > 0);

  const dayWeights = weighted.map((row) => row.days);
  const { shares: fairShares } = splitElectricityWeighted({
    totalPaise: input.totalBillPaise,
    weights: dayWeights.length > 0 ? dayWeights : [1],
  });

  const alreadyCollectedPaise = [...input.collectedByCustomerId.values()].reduce(
    (sum, amount) => sum + amount,
    0,
  );
  const remainingToRecoverPaise = Math.max(0, input.totalBillPaise - alreadyCollectedPaise);
  const unallocatedCollectedPaise = Math.max(0, alreadyCollectedPaise - input.totalBillPaise);

  const lineMeta = weighted.map((row, index) => {
    const fairSharePaise = fairShares[index] ?? 0;
    const collectedPaise = input.collectedByCustomerId.get(row.occupant.customerId) ?? 0;
    const stillOwesPaise = Math.max(0, fairSharePaise - collectedPaise);
    return { row, fairSharePaise, collectedPaise, stillOwesPaise, days: row.days };
  });

  const totalStillOwesPaise = lineMeta.reduce((sum, line) => sum + line.stillOwesPaise, 0);
  const recoverPoolPaise =
    totalStillOwesPaise > 0
      ? Math.min(remainingToRecoverPaise, totalStillOwesPaise)
      : 0;

  const checkoutShareByCustomerId = new Map<string, number>();
  if (recoverPoolPaise > 0 && totalStillOwesPaise > 0) {
    const { shares } = splitElectricityWeighted({
      totalPaise: recoverPoolPaise,
      weights: lineMeta.map((line) => line.stillOwesPaise),
    });
    lineMeta.forEach((line, index) => {
      checkoutShareByCustomerId.set(line.row.occupant.customerId, shares[index] ?? 0);
    });
  }

  const occupants: OccupantElectricityLine[] = lineMeta.map((line) => {
    const isCurrent = line.row.occupant.customerId === input.currentCustomerId;
    const checkoutSharePaise = checkoutShareByCustomerId.get(line.row.occupant.customerId) ?? 0;
    const isPaid = line.collectedPaise >= line.fairSharePaise && line.fairSharePaise > 0;

    return {
      bookingId: line.row.occupant.bookingId,
      customerId: line.row.occupant.customerId,
      customerName: line.row.occupant.customerName,
      occupancyDays: line.days,
      fairSharePaise: line.fairSharePaise,
      collectedPaise: line.collectedPaise,
      settlementStatus: isPaid ? 'paid' : isCurrent ? 'pending' : 'estimated',
      checkoutSharePaise,
    };
  });

  const currentLine = lineMeta.find(
    (line) => line.row.occupant.customerId === input.currentCustomerId,
  );
  const currentResidentFairSharePaise = currentLine?.fairSharePaise ?? 0;
  const currentResidentCollectedPaise = currentLine?.collectedPaise ?? 0;
  const currentResidentSharePaise =
    checkoutShareByCustomerId.get(input.currentCustomerId) ?? 0;
  const currentResidentRemainingDuePaise = currentResidentSharePaise;
  const otherResidentsCollectedPaise = Math.max(
    0,
    alreadyCollectedPaise - currentResidentCollectedPaise,
  );

  return {
    billingMonth: input.billingMonth,
    periodStart: input.periodStart,
    periodEndExclusive: input.periodEndExclusive,
    unitsConsumed: input.unitsConsumed ?? null,
    totalBillPaise: input.totalBillPaise,
    alreadyCollectedPaise,
    remainingToRecoverPaise,
    otherResidentsCollectedPaise,
    currentResidentFairSharePaise,
    currentResidentCollectedPaise,
    currentResidentRemainingDuePaise,
    unallocatedCollectedPaise,
    occupants,
    currentResidentSharePaise,
  };
}

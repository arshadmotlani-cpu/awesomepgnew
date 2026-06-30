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
  alreadyCollectedPaise: number;
  remainingToRecoverPaise: number;
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

  const unsettled = weighted.filter(
    (row) => (input.collectedByCustomerId.get(row.occupant.customerId) ?? 0) <= 0,
  );
  const unsettledWeights = unsettled.map((row) => row.days);
  const { shares: remainingShares } = splitElectricityWeighted({
    totalPaise: remainingToRecoverPaise,
    weights: unsettledWeights.length > 0 ? unsettledWeights : [1],
  });

  const occupants: OccupantElectricityLine[] = weighted.map((row, index) => {
    const collectedPaise = input.collectedByCustomerId.get(row.occupant.customerId) ?? 0;
    const isPaid = collectedPaise > 0;
    const unsettledIndex = unsettled.findIndex(
      (candidate) => candidate.occupant.customerId === row.occupant.customerId,
    );
    const checkoutSharePaise =
      unsettledIndex >= 0 ? (remainingShares[unsettledIndex] ?? 0) : 0;
    const isCurrent = row.occupant.customerId === input.currentCustomerId;

    return {
      bookingId: row.occupant.bookingId,
      customerId: row.occupant.customerId,
      customerName: row.occupant.customerName,
      occupancyDays: row.days,
      fairSharePaise: fairShares[index] ?? 0,
      collectedPaise,
      settlementStatus: isPaid ? 'paid' : isCurrent ? 'pending' : 'estimated',
      checkoutSharePaise,
    };
  });

  const currentResidentSharePaise =
    occupants.find((line) => line.customerId === input.currentCustomerId)?.checkoutSharePaise ?? 0;

  return {
    billingMonth: input.billingMonth,
    periodStart: input.periodStart,
    periodEndExclusive: input.periodEndExclusive,
    unitsConsumed: input.unitsConsumed ?? null,
    totalBillPaise: input.totalBillPaise,
    alreadyCollectedPaise,
    remainingToRecoverPaise,
    occupants,
    currentResidentSharePaise,
  };
}

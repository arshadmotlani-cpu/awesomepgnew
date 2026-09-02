/**
 * Pure monthly electricity invoice allocation for a room billing cycle.
 * Room contributions (historical + checkout recovery) reduce the splittable pool;
 * contributors are excluded from new invoices.
 */
import { splitElectricity, splitElectricityWeighted } from '@/src/services/billing';

export type MonthlyElectricityOccupant = {
  bookingId: string;
  customerId: string;
  bedCount: number;
  weight: number;
  /** Unique calendar dates covered in this room; bed identity is intentionally absent. */
  occupiedDates?: string[];
};

export type MonthlyElectricityInvoiceLine = {
  bookingId: string;
  customerId: string;
  amountPaise: number;
  excludedBecauseCheckoutPaid: boolean;
};

export type DailyRoomElectricityAllocation = {
  date: string;
  roomPoolPaise: number;
  occupantCustomerIds: string[];
  perOccupantPaise: number;
  roundingRemainderPaise: number;
  emptyRoomPaise: number;
};

export type MonthlyElectricityAllocationResult = {
  prepaidCreditAppliedPaise: number;
  checkoutCreditAppliedPaise: number;
  manualCreditAppliedPaise: number;
  roomContributionsAppliedPaise: number;
  netSplittablePaise: number;
  billableOccupantCount: number;
  invoices: MonthlyElectricityInvoiceLine[];
  perResidentPaise: number;
  remainderPaise: number;
  emptyDayPaise: number;
  dailyRoundingRemainderPaise: number;
  calculatedShareByCustomerId: Map<string, number>;
  contributionAppliedByCustomerId: Map<string, number>;
  dailyAllocation: DailyRoomElectricityAllocation[];
};

export function allocateMonthlyElectricityInvoices(input: {
  grossTotalPaise: number;
  prepaidCreditPaise: number;
  /** Unified room contributions (historical + checkout recovery). When set, replaces legacy checkout/manual credits. */
  contributionsByCustomerId?: Map<string, number>;
  manualCreditPaise?: number;
  occupants: MonthlyElectricityOccupant[];
  checkoutCollectedByCustomerId: Map<string, number>;
  useProRata: boolean;
  /** Active beds in the room — SSOT divisor for equal split. */
  activeBedCount: number;
  /** Every calendar date in the billing month. Enables canonical daily room sharing. */
  billingDays?: string[];
}): MonthlyElectricityAllocationResult {
  const prepaidCreditAppliedPaise = Math.min(
    Math.max(0, input.prepaidCreditPaise),
    input.grossTotalPaise,
  );
  const afterPrepaidPaise = input.grossTotalPaise - prepaidCreditAppliedPaise;

  if (input.billingDays && input.billingDays.length > 0) {
    return allocateDailyRoomElectricity({
      ...input,
      billingDays: input.billingDays,
      prepaidCreditAppliedPaise,
      afterPrepaidPaise,
    });
  }

  const useContributionsSsot =
    input.contributionsByCustomerId != null && input.contributionsByCustomerId.size > 0;

  let checkoutCreditAppliedPaise = 0;
  let manualCreditAppliedPaise = 0;
  let roomContributionsAppliedPaise = 0;
  let netSplittablePaise = afterPrepaidPaise;
  const contributedCustomerIds = new Set<string>();

  if (useContributionsSsot) {
    for (const [customerId, amount] of input.contributionsByCustomerId!) {
      if (amount > 0) contributedCustomerIds.add(customerId);
    }
    const totalContributions = [...input.contributionsByCustomerId!.values()].reduce(
      (sum, amount) => sum + amount,
      0,
    );
    roomContributionsAppliedPaise = Math.min(totalContributions, afterPrepaidPaise);
    netSplittablePaise = Math.max(0, afterPrepaidPaise - roomContributionsAppliedPaise);
    checkoutCreditAppliedPaise = roomContributionsAppliedPaise;
  } else {
    checkoutCreditAppliedPaise = [...input.checkoutCollectedByCustomerId.values()].reduce(
      (sum, amount) => sum + amount,
      0,
    );
    const cappedCheckoutCredit = Math.min(checkoutCreditAppliedPaise, afterPrepaidPaise);
    const afterCheckoutPaise = Math.max(0, afterPrepaidPaise - cappedCheckoutCredit);
    manualCreditAppliedPaise = Math.min(
      Math.max(0, input.manualCreditPaise ?? 0),
      afterCheckoutPaise,
    );
    netSplittablePaise = Math.max(0, afterCheckoutPaise - manualCreditAppliedPaise);
    checkoutCreditAppliedPaise = cappedCheckoutCredit;
    roomContributionsAppliedPaise = cappedCheckoutCredit + manualCreditAppliedPaise;

    for (const [customerId, amount] of input.checkoutCollectedByCustomerId) {
      if (amount > 0) contributedCustomerIds.add(customerId);
    }
  }

  const billable = input.occupants.filter((o) => !contributedCustomerIds.has(o.customerId));
  const excluded = input.occupants.filter((o) => contributedCustomerIds.has(o.customerId));

  const billableBedShares = billable.reduce((sum, o) => sum + o.bedCount, 0);
  const billableWeight = billable.reduce((sum, o) => sum + o.weight, 0);
  const useProRata = input.useProRata && billableWeight > 0;
  const splitDivisor = Math.max(1, input.activeBedCount);

  const invoices: MonthlyElectricityInvoiceLine[] = excluded.map((o) => ({
    bookingId: o.bookingId,
    customerId: o.customerId,
    amountPaise: 0,
    excludedBecauseCheckoutPaid: true,
  }));

  if (netSplittablePaise <= 0 || billable.length === 0) {
    return {
      prepaidCreditAppliedPaise,
      checkoutCreditAppliedPaise,
      manualCreditAppliedPaise,
      roomContributionsAppliedPaise,
      netSplittablePaise,
      billableOccupantCount: splitDivisor,
      invoices,
      perResidentPaise: 0,
      remainderPaise: 0,
      emptyDayPaise: 0,
      dailyRoundingRemainderPaise: 0,
      calculatedShareByCustomerId: new Map(),
      contributionAppliedByCustomerId: new Map(),
      dailyAllocation: [],
    };
  }

  const equalSplit = splitElectricity({
    totalPaise: netSplittablePaise,
    occupantCount: splitDivisor,
  });
  const weightedShares = useProRata
    ? splitElectricityWeighted({
        totalPaise: netSplittablePaise,
        weights: billable.map((o) => o.weight),
      })
    : null;

  let bookingIdx = 0;
  for (const occupant of billable) {
    const amount = useProRata
      ? (weightedShares!.shares[bookingIdx] ?? 0)
      : equalSplit.perResidentPaise * occupant.bedCount;
    bookingIdx += 1;
    if (amount > 0) {
      invoices.push({
        bookingId: occupant.bookingId,
        customerId: occupant.customerId,
        amountPaise: amount,
        excludedBecauseCheckoutPaid: false,
      });
    }
  }

  return {
    prepaidCreditAppliedPaise,
    checkoutCreditAppliedPaise,
    manualCreditAppliedPaise,
    roomContributionsAppliedPaise,
    netSplittablePaise,
    billableOccupantCount: splitDivisor,
    invoices,
    perResidentPaise: useProRata ? 0 : equalSplit.perResidentPaise,
    remainderPaise: useProRata ? weightedShares!.remainderPaise : equalSplit.remainderPaise,
    emptyDayPaise: 0,
    dailyRoundingRemainderPaise: 0,
    calculatedShareByCustomerId: new Map(
      invoices.map((invoice) => [invoice.customerId, invoice.amountPaise]),
    ),
    contributionAppliedByCustomerId: new Map(),
    dailyAllocation: [],
  };
}

function allocateDailyRoomElectricity(input: {
  grossTotalPaise: number;
  prepaidCreditPaise: number;
  contributionsByCustomerId?: Map<string, number>;
  manualCreditPaise?: number;
  occupants: MonthlyElectricityOccupant[];
  checkoutCollectedByCustomerId: Map<string, number>;
  useProRata: boolean;
  activeBedCount: number;
  billingDays: string[];
  prepaidCreditAppliedPaise: number;
  afterPrepaidPaise: number;
}): MonthlyElectricityAllocationResult {
  const useContributionsSsot =
    input.contributionsByCustomerId != null && input.contributionsByCustomerId.size > 0;
  const contributionSource = useContributionsSsot
    ? input.contributionsByCustomerId!
    : input.checkoutCollectedByCustomerId;
  const manualCreditAppliedPaise = useContributionsSsot
    ? 0
    : Math.min(Math.max(0, input.manualCreditPaise ?? 0), input.afterPrepaidPaise);
  const roomPoolPaise = Math.max(0, input.afterPrepaidPaise - manualCreditAppliedPaise);
  const baseDailyPaise = Math.floor(roomPoolPaise / input.billingDays.length);
  const dailyPoolRemainder = roomPoolPaise % input.billingDays.length;

  const occupancyByDate = new Map<string, Set<string>>();
  for (const occupant of input.occupants) {
    for (const date of new Set(occupant.occupiedDates ?? [])) {
      if (!input.billingDays.includes(date)) continue;
      const residents = occupancyByDate.get(date) ?? new Set<string>();
      residents.add(occupant.customerId);
      occupancyByDate.set(date, residents);
    }
  }

  const calculatedShareByCustomerId = new Map<string, number>();
  const dailyAllocation: DailyRoomElectricityAllocation[] = [];
  let emptyDayPaise = 0;
  let dailyRoundingRemainderPaise = 0;

  input.billingDays.forEach((date, dayIndex) => {
    const dayPool = baseDailyPaise + (dayIndex < dailyPoolRemainder ? 1 : 0);
    const occupantCustomerIds = [...(occupancyByDate.get(date) ?? [])].sort();
    if (occupantCustomerIds.length === 0) {
      emptyDayPaise += dayPool;
      dailyAllocation.push({
        date,
        roomPoolPaise: dayPool,
        occupantCustomerIds,
        perOccupantPaise: 0,
        roundingRemainderPaise: 0,
        emptyRoomPaise: dayPool,
      });
      return;
    }

    const perOccupantPaise = Math.floor(dayPool / occupantCustomerIds.length);
    const roundingRemainderPaise = dayPool - perOccupantPaise * occupantCustomerIds.length;
    dailyRoundingRemainderPaise += roundingRemainderPaise;
    for (const customerId of occupantCustomerIds) {
      calculatedShareByCustomerId.set(
        customerId,
        (calculatedShareByCustomerId.get(customerId) ?? 0) + perOccupantPaise,
      );
    }
    dailyAllocation.push({
      date,
      roomPoolPaise: dayPool,
      occupantCustomerIds,
      perOccupantPaise,
      roundingRemainderPaise,
      emptyRoomPaise: 0,
    });
  });

  const contributionAppliedByCustomerId = new Map<string, number>();
  const invoices: MonthlyElectricityInvoiceLine[] = [];
  let roomContributionsAppliedPaise = 0;
  const occupantByCustomerId = new Map(
    input.occupants.map((occupant) => [occupant.customerId, occupant]),
  );

  for (const [customerId, calculatedShare] of calculatedShareByCustomerId) {
    const contribution = Math.max(0, contributionSource.get(customerId) ?? 0);
    const applied = Math.min(calculatedShare, contribution);
    contributionAppliedByCustomerId.set(customerId, applied);
    roomContributionsAppliedPaise += applied;
    const occupant = occupantByCustomerId.get(customerId);
    if (!occupant) continue;
    invoices.push({
      bookingId: occupant.bookingId,
      customerId,
      amountPaise: calculatedShare - applied,
      excludedBecauseCheckoutPaid: applied >= calculatedShare && calculatedShare > 0,
    });
  }

  return {
    prepaidCreditAppliedPaise: input.prepaidCreditAppliedPaise,
    checkoutCreditAppliedPaise: roomContributionsAppliedPaise,
    manualCreditAppliedPaise,
    roomContributionsAppliedPaise,
    netSplittablePaise: roomPoolPaise,
    billableOccupantCount: calculatedShareByCustomerId.size,
    invoices,
    perResidentPaise: 0,
    remainderPaise: emptyDayPaise + dailyRoundingRemainderPaise,
    emptyDayPaise,
    dailyRoundingRemainderPaise,
    calculatedShareByCustomerId,
    contributionAppliedByCustomerId,
    dailyAllocation,
  };
}

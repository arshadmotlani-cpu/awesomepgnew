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
};

export type MonthlyElectricityInvoiceLine = {
  bookingId: string;
  customerId: string;
  amountPaise: number;
  excludedBecauseCheckoutPaid: boolean;
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
}): {
  prepaidCreditAppliedPaise: number;
  checkoutCreditAppliedPaise: number;
  manualCreditAppliedPaise: number;
  roomContributionsAppliedPaise: number;
  netSplittablePaise: number;
  billableOccupantCount: number;
  invoices: MonthlyElectricityInvoiceLine[];
  perResidentPaise: number;
  remainderPaise: number;
} {
  const prepaidCreditAppliedPaise = Math.min(
    Math.max(0, input.prepaidCreditPaise),
    input.grossTotalPaise,
  );
  const afterPrepaidPaise = input.grossTotalPaise - prepaidCreditAppliedPaise;

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
      billableOccupantCount: billableBedShares,
      invoices,
      perResidentPaise: 0,
      remainderPaise: 0,
    };
  }

  const equalSplit = splitElectricity({
    totalPaise: netSplittablePaise,
    occupantCount: billableBedShares,
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
    billableOccupantCount: billableBedShares,
    invoices,
    perResidentPaise: useProRata ? 0 : equalSplit.perResidentPaise,
    remainderPaise: useProRata ? weightedShares!.remainderPaise : equalSplit.remainderPaise,
  };
}

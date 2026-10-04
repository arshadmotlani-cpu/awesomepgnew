/**
 * Shared electricity generation allocation (meter period + daily split).
 */
import { allocateMonthlyElectricityInvoices } from '@/src/lib/billing/roomElectricityMonthlyAllocation';
import type { RoomElectricityOccupantLoadResult } from '@/src/lib/billing/roomElectricityOccupants';
import type { VerifiedPriorCollectionsLoadResult } from '@/src/lib/billing/electricityVerifiedPriorCollections';
import type { ResolvedElectricityGenerationMeterPeriod } from '@/src/lib/billing/resolveElectricityGenerationMeterPeriod';

export type ElectricityGenerationAllocationPreview = {
  grossTotalPaise: number;
  unitsConsumed: number;
  allocation: ReturnType<typeof allocateMonthlyElectricityInvoices>;
  meterPeriod: ResolvedElectricityGenerationMeterPeriod;
  verifiedPrior: VerifiedPriorCollectionsLoadResult;
};

export function buildElectricityGenerationAllocation(input: {
  meterPeriod: ResolvedElectricityGenerationMeterPeriod;
  previousReadingUnits: number;
  currentReadingUnits: number;
  ratePerUnitPaise: number;
  roomPrepaidCreditPaise: number;
  manualCreditPaise: number;
  verifiedPrior: VerifiedPriorCollectionsLoadResult;
  occupantLoad: RoomElectricityOccupantLoadResult;
  activeBedCount: number;
}): ElectricityGenerationAllocationPreview {
  const unitsConsumed = input.currentReadingUnits - input.previousReadingUnits;
  const grossTotalPaise = Math.round(unitsConsumed * input.ratePerUnitPaise);

  const allocation = allocateMonthlyElectricityInvoices({
    grossTotalPaise,
    prepaidCreditPaise: input.roomPrepaidCreditPaise,
    contributionsByCustomerId:
      input.verifiedPrior.totalPaise > 0 ? input.verifiedPrior.byCustomerId : undefined,
    manualCreditPaise: input.verifiedPrior.totalPaise > 0 ? undefined : input.manualCreditPaise,
    occupants: input.occupantLoad.occupants,
    checkoutCollectedByCustomerId: occupantLoadCheckoutMap(input.occupantLoad),
    useProRata: true,
    activeBedCount: input.activeBedCount,
    billingDays: input.meterPeriod.billingDays,
  });

  return {
    grossTotalPaise,
    unitsConsumed,
    allocation,
    meterPeriod: input.meterPeriod,
    verifiedPrior: input.verifiedPrior,
  };
}

function occupantLoadCheckoutMap(
  load: RoomElectricityOccupantLoadResult,
): Map<string, number> {
  return load.checkoutCollectedByCustomerId;
}

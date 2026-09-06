/**
 * Server-side pre-generation electricity preview for Billing Center.
 */
import { loadRoomElectricityOccupantsForMonth } from '@/src/lib/billing/roomElectricityOccupants';
import { loadVerifiedPriorElectricityCollectionsForMonth } from '@/src/lib/billing/electricityVerifiedPriorCollections';
import type {
  PgElectricityOccupantPreview,
  PgElectricityRoomGenerationPreview,
} from '@/src/lib/billing/pgElectricityGenerationPreviewPure';

export type { PgElectricityOccupantPreview, PgElectricityRoomGenerationPreview };

export async function loadPgElectricityRoomGenerationPreview(input: {
  roomId: string;
  billingMonth: string;
}): Promise<PgElectricityRoomGenerationPreview> {
  const [occupantLoad, verifiedPrior] = await Promise.all([
    loadRoomElectricityOccupantsForMonth({
      roomId: input.roomId,
      billingMonth: input.billingMonth,
      includeFixedStay: true,
      useProRataByActiveDays: true,
    }),
    loadVerifiedPriorElectricityCollectionsForMonth(input.roomId, input.billingMonth),
  ]);

  const collectedByCustomer = verifiedPrior.byCustomerId;
  const occupants: PgElectricityOccupantPreview[] = occupantLoad.occupants.map((o) => ({
    customerId: o.customerId,
    customerName: o.customerName ?? 'Resident',
    occupancyDays: o.occupiedDates?.length ?? o.weight,
    previouslyCollectedPaise: collectedByCustomer.get(o.customerId) ?? 0,
  }));

  return {
    previouslyCollectedPaise: verifiedPrior.totalPaise,
    occupants,
  };
}

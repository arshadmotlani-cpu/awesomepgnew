/**
 * Server-side pre-generation electricity preview for Billing Center.
 */
import { loadRoomElectricityOccupantsForMonth } from '@/src/lib/billing/roomElectricityOccupants';
import { loadRoomElectricityContributionsForMonth } from '@/src/services/electricityRoomContributions';
import type {
  PgElectricityOccupantPreview,
  PgElectricityRoomGenerationPreview,
} from '@/src/lib/billing/pgElectricityGenerationPreviewPure';

export type { PgElectricityOccupantPreview, PgElectricityRoomGenerationPreview };

export async function loadPgElectricityRoomGenerationPreview(input: {
  roomId: string;
  billingMonth: string;
}): Promise<PgElectricityRoomGenerationPreview> {
  const [occupantLoad, contributionsLoad] = await Promise.all([
    loadRoomElectricityOccupantsForMonth({
      roomId: input.roomId,
      billingMonth: input.billingMonth,
      includeFixedStay: true,
      useProRataByActiveDays: true,
    }),
    loadRoomElectricityContributionsForMonth(input.roomId, input.billingMonth),
  ]);

  const collectedByCustomer = contributionsLoad.byCustomerId;
  const occupants: PgElectricityOccupantPreview[] = occupantLoad.occupants.map((o) => ({
    customerId: o.customerId,
    customerName: o.customerName ?? 'Resident',
    occupancyDays: o.occupiedDates?.length ?? o.weight,
    previouslyCollectedPaise: collectedByCustomer.get(o.customerId) ?? 0,
  }));

  return {
    previouslyCollectedPaise: contributionsLoad.totalPaise,
    occupants,
  };
}

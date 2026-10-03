/**
 * Server-side pre-generation electricity preview for Billing Center.
 */
import { loadRoomElectricityOccupantsForMonth } from '@/src/lib/billing/roomElectricityOccupants';
import { loadVerifiedPriorElectricityCollectionsForMonth } from '@/src/lib/billing/electricityVerifiedPriorCollections';
import { loadRoomTransferMeterEvidenceForRoomMonth } from '@/src/lib/roomTransfer/roomChangeTransferMeterEvidence';
import type {
  PgElectricityOccupantPreview,
  PgElectricityRoomGenerationPreview,
} from '@/src/lib/billing/pgElectricityGenerationPreviewPure';

export type { PgElectricityOccupantPreview, PgElectricityRoomGenerationPreview };

export async function loadPgElectricityRoomGenerationPreview(input: {
  roomId: string;
  billingMonth: string;
}): Promise<PgElectricityRoomGenerationPreview> {
  const [occupantLoad, verifiedPrior, transferEvidenceRows] = await Promise.all([
    loadRoomElectricityOccupantsForMonth({
      roomId: input.roomId,
      billingMonth: input.billingMonth,
      includeFixedStay: true,
      useProRataByActiveDays: true,
    }),
    loadVerifiedPriorElectricityCollectionsForMonth(input.roomId, input.billingMonth),
    loadRoomTransferMeterEvidenceForRoomMonth({
      roomId: input.roomId,
      billingMonth: input.billingMonth,
    }),
  ]);

  const collectedByCustomer = verifiedPrior.byCustomerId;
  const evidenceByCustomer = new Map(
    transferEvidenceRows.map((row) => [row.customerId, row] as const),
  );
  const occupants: PgElectricityOccupantPreview[] = occupantLoad.occupants.map((o) => ({
    customerId: o.customerId,
    customerName: o.customerName ?? 'Resident',
    occupancyDays: o.occupiedDates?.length ?? o.weight,
    previouslyCollectedPaise: collectedByCustomer.get(o.customerId) ?? 0,
    transferEvidence: evidenceByCustomer.get(o.customerId) ?? null,
  }));

  return {
    previouslyCollectedPaise: verifiedPrior.totalPaise,
    occupants,
    transferEvidenceRows,
  };
}

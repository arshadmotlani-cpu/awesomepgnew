/** Pure helpers for Billing Center pre-generation preview (no DB imports). */

export type PgElectricityTransferEvidencePreview = {
  roomChangeRequestId: string;
  customerId: string;
  fromRoomLabel: string;
  fromBedCode: string;
  transferDate: string;
  occupancyStart: string | null;
  occupancyEnd: string;
  previousFinalizedReadingUnits: number | null;
  transferReadingUnits: number;
  meterLogId: string;
  meterPhotoViewUrl: string | null;
};

export type PgElectricityOccupantPreview = {
  customerId: string;
  customerName: string;
  occupancyDays: number;
  previouslyCollectedPaise: number;
  transferEvidence?: PgElectricityTransferEvidencePreview | null;
};

export type PgElectricityRoomGenerationPreview = {
  previouslyCollectedPaise: number;
  occupants: PgElectricityOccupantPreview[];
  transferEvidenceRows: PgElectricityTransferEvidencePreview[];
};

/** Remaining room electricity after prior collections (gross from meter entry). */
export function remainingElectricityAfterCollections(
  grossTotalPaise: number,
  previouslyCollectedPaise: number,
): number {
  return Math.max(0, grossTotalPaise - Math.max(0, previouslyCollectedPaise));
}

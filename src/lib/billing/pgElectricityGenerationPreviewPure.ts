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
  occupancyStart: string;
  occupancyEnd: string;
  occupancyDays: number;
  previouslyCollectedPaise: number;
  transferEvidence?: PgElectricityTransferEvidencePreview | null;
};

export type PgElectricityAllocationPreviewLine = {
  customerId: string;
  customerName: string;
  occupancyStart: string;
  occupancyEnd: string;
  occupancyDays: number;
  grossAllocationPaise: number;
  previouslyCollectedPaise: number;
  finalInvoicePaise: number;
};

export type PgElectricityAllocationPreview = {
  grossTotalPaise: number;
  invoiceTotalPaise: number;
  remainderPaise: number;
  lines: PgElectricityAllocationPreviewLine[];
};

export type PgElectricityMeterPeriodPreview = {
  reportingBillingMonth: string;
  periodStartDate: string;
  periodEndDate: string;
  previousReadingUnits: number;
  currentReadingUnits: number | null;
  unitsConsumed: number | null;
};

export type PgElectricityPriorCollectionsPreview = {
  totalPaise: number;
};

export type PgElectricityRoomGenerationPreview = {
  meterPeriod: PgElectricityMeterPeriodPreview;
  priorCollections: PgElectricityPriorCollectionsPreview;
  previouslyCollectedPaise: number;
  occupants: PgElectricityOccupantPreview[];
  transferEvidenceRows: PgElectricityTransferEvidencePreview[];
  allocationPreview: PgElectricityAllocationPreview | null;
};

/** Remaining room electricity after prior collections (gross from meter entry). */
export function remainingElectricityAfterCollections(
  grossTotalPaise: number,
  previouslyCollectedPaise: number,
): number {
  return Math.max(0, grossTotalPaise - Math.max(0, previouslyCollectedPaise));
}

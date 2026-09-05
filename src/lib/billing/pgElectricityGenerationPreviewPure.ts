/** Pure helpers for Billing Center pre-generation preview (no DB imports). */

export type PgElectricityOccupantPreview = {
  customerId: string;
  customerName: string;
  occupancyDays: number;
  previouslyCollectedPaise: number;
};

export type PgElectricityRoomGenerationPreview = {
  previouslyCollectedPaise: number;
  occupants: PgElectricityOccupantPreview[];
};

/** Remaining room electricity after prior collections (gross from meter entry). */
export function remainingElectricityAfterCollections(
  grossTotalPaise: number,
  previouslyCollectedPaise: number,
): number {
  return Math.max(0, grossTotalPaise - Math.max(0, previouslyCollectedPaise));
}

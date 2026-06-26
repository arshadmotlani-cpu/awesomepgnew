/** Client-safe electricity evidence check for checkout settlements. */

export type CheckoutElectricityEvidenceInput = {
  electricityMeterPhotoUrl?: string | null;
  electricityUseAverage?: boolean | null;
  meterPhotoMissing?: boolean | null;
  electricitySharePaise?: number | null;
  electricityCalculationMethod?: string | null;
};

export function hasCheckoutElectricityEvidence(row: CheckoutElectricityEvidenceInput): boolean {
  return (
    Boolean(row.electricityMeterPhotoUrl) ||
    Boolean(row.electricityUseAverage) ||
    Boolean(row.meterPhotoMissing) ||
    Number(row.electricitySharePaise ?? 0) > 0 ||
    row.electricityCalculationMethod !== 'meter_reading'
  );
}

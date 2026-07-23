/** Client-safe electricity evidence check for checkout settlements. */

export type CheckoutElectricityEvidenceInput = {
  electricityMeterPhotoUrl?: string | null;
  meterPhotoMissing?: boolean | null;
  electricitySharePaise?: number | null;
  electricityCalculationMethod?: string | null;
};

export function hasCheckoutElectricityEvidence(row: CheckoutElectricityEvidenceInput): boolean {
  return (
    Boolean(row.electricityMeterPhotoUrl) ||
    Boolean(row.meterPhotoMissing) ||
    Number(row.electricitySharePaise ?? 0) > 0 ||
    row.electricityCalculationMethod === 'manual_amount'
  );
}

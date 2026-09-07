/**
 * Rent late-fee base — applicable monthly room rent, never the prorated invoice face.
 *
 * Move-out may reduce `rent_paise`; late fee still accrues on monthly room rent.
 * `lateFeePaise = floor(monthlyRoomRentPaise × chargeableDays / 100)` (via computeLateFee).
 */

export function resolveRentLateFeeBasePaise(input: {
  /** Applicable monthly room rent for the billing month. */
  monthlyRoomRentPaise?: number | null;
  /** Invoice principal after discounts/proration — fallback only when monthly is missing. */
  invoiceRentPaise: number;
}): number {
  const monthly = Math.max(0, Math.floor(Number(input.monthlyRoomRentPaise ?? 0)));
  if (monthly > 0) return monthly;
  return Math.max(0, Math.floor(Number(input.invoiceRentPaise ?? 0)));
}

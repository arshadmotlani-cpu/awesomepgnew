/**
 * Pure checkout electricity math — safe for client components.
 */

import { DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE } from '@/src/lib/billing/constants';
import { asPlainNumber } from '@/src/lib/format';

export type CheckoutElectricityCalc = {
  unitsConsumed: number;
  totalBillPaise: number;
  roomOccupants: number;
  sharePaise: number;
  ratePerUnitPaise: number;
};

export function calculateCheckoutElectricity(input: {
  previousReading: number;
  currentReading: number;
  ratePerUnitPaise: number;
  roomOccupants: number;
}): { ok: true; calc: CheckoutElectricityCalc } | { ok: false; error: string } {
  const previous = asPlainNumber(input.previousReading);
  const current = asPlainNumber(input.currentReading);
  const rate = asPlainNumber(input.ratePerUnitPaise);
  const occupants = Math.max(1, Math.floor(asPlainNumber(input.roomOccupants)));

  if (previous < 0 || current < 0) {
    return { ok: false, error: 'Meter readings cannot be negative.' };
  }
  if (current < previous) {
    return { ok: false, error: 'Current reading must be greater than or equal to previous reading.' };
  }
  if (rate <= 0) {
    return { ok: false, error: 'Rate per unit must be greater than zero.' };
  }

  const unitsConsumed = current - previous;
  const totalBillPaise = Math.round(unitsConsumed * rate);
  const sharePaise = Math.floor(totalBillPaise / occupants);

  return {
    ok: true,
    calc: {
      unitsConsumed,
      totalBillPaise,
      roomOccupants: occupants,
      sharePaise,
      ratePerUnitPaise: rate,
    },
  };
}

export function defaultElectricityRatePaise(): number {
  return DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE;
}

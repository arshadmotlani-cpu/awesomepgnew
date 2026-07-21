/**
 * Pure checkout electricity math — safe for client components.
 */

import { DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE } from '@/src/lib/billing/constants';
import { asPlainNumber } from '@/src/lib/format';

export type ElectricityCalculationMethod = 'meter_reading' | 'average_billing' | 'manual_amount';

export type CheckoutElectricityCalc = {
  method: ElectricityCalculationMethod;
  unitsConsumed: number | null;
  totalBillPaise: number;
  roomOccupants: number;
  autoDetectedOccupants: number;
  sharePaise: number;
  ratePerUnitPaise: number | null;
};

export function effectiveSharingCount(input: {
  autoDetectedCount: number;
  roomCapacity: number;
  overrideEnabled: boolean;
  overrideCount?: number | null;
}): number {
  if (input.roomCapacity <= 1) return 1;
  if (input.overrideEnabled && input.overrideCount != null && input.overrideCount >= 1) {
    return Math.floor(input.overrideCount);
  }
  return Math.max(1, Math.floor(input.roomCapacity));
}

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
  const sharePaise = input.roomOccupants <= 1 ? totalBillPaise : Math.floor(totalBillPaise / occupants);

  return {
    ok: true,
    calc: {
      method: 'meter_reading',
      unitsConsumed,
      totalBillPaise,
      roomOccupants: occupants,
      autoDetectedOccupants: occupants,
      sharePaise,
      ratePerUnitPaise: rate,
    },
  };
}

export function calculateAverageBillingElectricity(input: {
  averageBillPaise: number;
  roomOccupants: number;
  autoDetectedOccupants: number;
}): { ok: true; calc: CheckoutElectricityCalc } | { ok: false; error: string } {
  const bill = asPlainNumber(input.averageBillPaise);
  const occupants = Math.max(1, Math.floor(asPlainNumber(input.roomOccupants)));
  if (bill <= 0) {
    return { ok: false, error: 'Average room bill must be greater than zero.' };
  }
  const sharePaise = occupants <= 1 ? bill : Math.floor(bill / occupants);
  return {
    ok: true,
    calc: {
      method: 'average_billing',
      unitsConsumed: null,
      totalBillPaise: bill,
      roomOccupants: occupants,
      autoDetectedOccupants: input.autoDetectedOccupants,
      sharePaise,
      ratePerUnitPaise: null,
    },
  };
}

export function calculateManualElectricityCharge(input: {
  manualChargePaise: number;
  roomOccupants: number;
  autoDetectedOccupants: number;
}): { ok: true; calc: CheckoutElectricityCalc } | { ok: false; error: string } {
  const charge = asPlainNumber(input.manualChargePaise);
  if (charge < 0) {
    return { ok: false, error: 'Manual electricity charge cannot be negative.' };
  }
  return {
    ok: true,
    calc: {
      method: 'manual_amount',
      unitsConsumed: null,
      totalBillPaise: charge,
      roomOccupants: Math.max(1, input.roomOccupants),
      autoDetectedOccupants: input.autoDetectedOccupants,
      sharePaise: charge,
      ratePerUnitPaise: null,
    },
  };
}

export function defaultElectricityRatePaise(): number {
  return DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE;
}

/** Fields required to resolve checkout electricity share from persisted settlement state. */
export type CheckoutElectricityResolutionInput = {
  electricityCalculationMethod: ElectricityCalculationMethod | string;
  electricitySharePaise: number;
  manualChargePaise?: number | null;
  electricityDeductFromDeposit?: boolean;
};

/**
 * Single source of truth for resident electricity share at checkout.
 * For manual_amount, manualChargePaise always wins over electricity_share_paise.
 */
export function resolveCheckoutElectricitySharePaise(
  row: CheckoutElectricityResolutionInput,
): number {
  if (row.electricityCalculationMethod === 'manual_amount') {
    return asPlainNumber(row.manualChargePaise ?? 0);
  }
  return asPlainNumber(row.electricitySharePaise);
}

/** Deposit deduction amount — zero when admin chose not to deduct from deposit. */
export function resolveCheckoutElectricityDeductionPaise(
  row: CheckoutElectricityResolutionInput,
): number {
  if (row.electricityDeductFromDeposit === false) return 0;
  return resolveCheckoutElectricitySharePaise(row);
}

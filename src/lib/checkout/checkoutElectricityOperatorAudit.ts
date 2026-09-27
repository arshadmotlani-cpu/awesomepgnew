/**
 * Operator checkout electricity — meter-period ledger presentation + deposit deduction SSOT.
 */
import { resolveCheckoutElectricityDeductionPaise } from '@/src/lib/checkout/electricitySettlementCalc';
import type { RoomElectricityMeterPeriodLedger } from '@/src/lib/billing/roomElectricityMeterPeriodLedger';
import { buildRoomElectricityMeterPeriodLedger } from '@/src/lib/billing/roomElectricityMeterPeriodLedger';
import type { RoomOccupantSlice } from '@/src/lib/checkout/roomElectricityAllocation';
import type {
  FinalizedBillMeterPeriod,
  ResidentInvoiceCredit,
} from '@/src/lib/billing/roomElectricityMeterPeriodLedger';

export type CheckoutResidentElectricityInvoiceSnapshot = {
  billingMonth: string;
  amountPaise: number;
  paidPaise: number;
  status: string;
  invoiceNumber?: string | null;
};

export type CheckoutElectricityOperatorAudit = {
  billingMonth: string;
  meterPeriodLedger: RoomElectricityMeterPeriodLedger;
  /** Persisted settlement row (may differ until admin saves). */
  depositDeductionPaise: number;
  residentInvoice: CheckoutResidentElectricityInvoiceSnapshot | null;
};

export type BuildCheckoutElectricityOperatorAuditInput = {
  billingMonth: string;
  vacatingDate: string;
  ratePerUnitPaise: number;
  chainOpeningUnits: number | null;
  checkoutClosingUnits: number;
  finalizedBill: FinalizedBillMeterPeriod | null;
  invoiceCredits: ResidentInvoiceCredit[];
  occupants: RoomOccupantSlice[];
  tailOccupants?: RoomOccupantSlice[];
  currentCustomerId: string;
  electricityCalculationMethod: string;
  electricitySharePaise: number;
  manualChargePaise?: number | null;
  electricityDeductFromDeposit: boolean;
  extraCollectedByCustomerId?: Map<string, number>;
};

export function resolveCheckoutElectricityDepositDeductionForSave(input: {
  meterPeriodLedger: RoomElectricityMeterPeriodLedger | null;
  timelineSharePaise: number;
  meterSharePaise: number;
  electricityDeductFromDeposit: boolean;
  electricityCalculationMethod: string;
}): number {
  if (!input.electricityDeductFromDeposit) return 0;
  if (input.electricityCalculationMethod === 'manual_amount') {
    return input.meterSharePaise;
  }
  if (input.meterPeriodLedger) {
    return input.meterPeriodLedger.suggestedDepositDeductionPaise;
  }
  return input.timelineSharePaise ?? input.meterSharePaise;
}

export function buildCheckoutElectricityOperatorAudit(
  input: BuildCheckoutElectricityOperatorAuditInput,
): CheckoutElectricityOperatorAudit {
  const meterPeriodLedger = buildRoomElectricityMeterPeriodLedger({
    billingMonth: input.billingMonth,
    vacatingDate: input.vacatingDate,
    ratePerUnitPaise: input.ratePerUnitPaise,
    chainOpeningUnits: input.chainOpeningUnits,
    checkoutClosingUnits: input.checkoutClosingUnits,
    finalizedBill: input.finalizedBill,
    invoiceCredits: input.invoiceCredits,
    extraCollectedByCustomerId: input.extraCollectedByCustomerId,
    occupants: input.occupants,
    tailOccupants: input.tailOccupants,
    currentCustomerId: input.currentCustomerId,
    electricityDeductFromDeposit: input.electricityDeductFromDeposit,
  });

  const residentInvoiceRow = input.invoiceCredits.find(
    (i) => i.customerId === input.currentCustomerId && i.status !== 'cancelled',
  );

  const depositDeductionPaise = resolveCheckoutElectricityDeductionPaise({
    electricityCalculationMethod: input.electricityCalculationMethod,
    electricitySharePaise: input.electricitySharePaise,
    manualChargePaise: input.manualChargePaise ?? null,
    electricityDeductFromDeposit: input.electricityDeductFromDeposit,
  });

  return {
    billingMonth: input.billingMonth,
    meterPeriodLedger,
    depositDeductionPaise,
    residentInvoice: residentInvoiceRow
      ? {
          billingMonth: input.billingMonth,
          amountPaise: residentInvoiceRow.amountPaise,
          paidPaise: residentInvoiceRow.paidPaise,
          status: residentInvoiceRow.status,
        }
      : null,
  };
}

/** Primary gross for UI — unbilled tail or open period, not full 337→479 when finalized bill exists. */
export function operatorPrimaryMeterPeriod(
  audit: CheckoutElectricityOperatorAudit,
): RoomElectricityMeterPeriodLedger['periods'][number] | null {
  const { meterPeriodLedger } = audit;
  if (meterPeriodLedger.primaryPeriodId) {
    return (
      meterPeriodLedger.periods.find((p) => p.id === meterPeriodLedger.primaryPeriodId) ?? null
    );
  }
  return meterPeriodLedger.periods[0] ?? null;
}

export function operatorDisplayRoomBillPaise(audit: CheckoutElectricityOperatorAudit): number {
  const primary = operatorPrimaryMeterPeriod(audit);
  if (primary) return primary.grossPaise;
  const finalized = audit.meterPeriodLedger.periods.find((p) => p.id === 'finalized');
  return finalized?.grossPaise ?? 0;
}

import type { RefundDeductionsSnapshot } from '@/src/db/schema/residentRequests';

export type RefundCompletionInput = {
  electricityUnitCostPaise?: number;
  electricityUnits?: number;
  damageChargePaise?: number;
  cleaningChargePaise?: number;
  penaltyChargePaise?: number;
  customChargePaise?: number;
  customChargeLabel?: string;
  refundMethod?: string;
};

export function computeRefundDeductions(
  depositHeldPaise: number,
  input: RefundCompletionInput,
): RefundDeductionsSnapshot & { finalRefundPaise: number; totalDeductionsPaise: number } {
  const electricityDeductionPaise =
    (input.electricityUnitCostPaise ?? 0) > 0 && (input.electricityUnits ?? 0) > 0
      ? input.electricityUnitCostPaise! * input.electricityUnits!
      : 0;
  const other =
    (input.damageChargePaise ?? 0) +
    (input.cleaningChargePaise ?? 0) +
    (input.penaltyChargePaise ?? 0) +
    (input.customChargePaise ?? 0);
  const totalDeductionsPaise = electricityDeductionPaise + other;
  const finalRefundPaise = Math.max(0, depositHeldPaise - totalDeductionsPaise);
  return {
    depositHeldPaise,
    electricityUnitCostPaise: input.electricityUnitCostPaise,
    electricityUnits: input.electricityUnits,
    electricityDeductionPaise,
    damageChargePaise: input.damageChargePaise,
    cleaningChargePaise: input.cleaningChargePaise,
    penaltyChargePaise: input.penaltyChargePaise,
    customChargePaise: input.customChargePaise,
    customChargeLabel: input.customChargeLabel,
    otherDeductionsPaise: other,
    finalRefundPaise,
    totalDeductionsPaise,
  };
}

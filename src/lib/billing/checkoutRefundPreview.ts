/**
 * Checkout refund preview — SSOT for deposit held minus settlement deductions.
 * Used by move-out pipeline, admin vacating previews, and resident refund estimates.
 */
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';

export type CheckoutRefundPreviewInput = {
  depositHeldPaise: number;
  noticeDeductionPaise: number;
  electricitySharePaise?: number;
  electricityDeductFromDeposit?: boolean;
  damageChargePaise?: number;
  cleaningChargePaise?: number;
  customChargePaise?: number;
  finalRefundPaise?: number | null;
  amountsLocked?: boolean;
};

export function computeCheckoutRefundPreview(input: CheckoutRefundPreviewInput): {
  depositHeldPaise: number;
  noticeDeductionPaise: number;
  electricityDeductionPaise: number;
  otherDeductionsPaise: number;
  totalDeductionsPaise: number;
  finalRefundPaise: number;
} {
  if (input.amountsLocked && input.finalRefundPaise != null) {
    const finalRefundPaise = guardDepositPaise(input.finalRefundPaise);
    return {
      depositHeldPaise: guardDepositPaise(input.depositHeldPaise),
      noticeDeductionPaise: guardDepositPaise(input.noticeDeductionPaise),
      electricityDeductionPaise: 0,
      otherDeductionsPaise: 0,
      totalDeductionsPaise: Math.max(
        0,
        guardDepositPaise(input.depositHeldPaise) - finalRefundPaise,
      ),
      finalRefundPaise,
    };
  }

  const depositHeldPaise = guardDepositPaise(input.depositHeldPaise);
  const noticeDeductionPaise = guardDepositPaise(input.noticeDeductionPaise);
  const electricityDeductionPaise =
    input.electricityDeductFromDeposit === false
      ? 0
      : guardDepositPaise(input.electricitySharePaise ?? 0);
  const otherDeductionsPaise =
    guardDepositPaise(input.damageChargePaise ?? 0) +
    guardDepositPaise(input.cleaningChargePaise ?? 0) +
    guardDepositPaise(input.customChargePaise ?? 0);
  const totalDeductionsPaise =
    noticeDeductionPaise + electricityDeductionPaise + otherDeductionsPaise;
  const finalRefundPaise = Math.max(0, depositHeldPaise - totalDeductionsPaise);

  return {
    depositHeldPaise,
    noticeDeductionPaise,
    electricityDeductionPaise,
    otherDeductionsPaise,
    totalDeductionsPaise,
    finalRefundPaise,
  };
}

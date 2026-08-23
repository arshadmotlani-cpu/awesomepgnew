import type { MoveOutPipelineItemClient } from '@/src/lib/moveOut/moveOutPipeline';
import { buildResidentMoveOutRefundSummary } from '@/src/lib/residents/residentMoveOutRefundSummary';
import type { VacatingApprovalPreview } from '@/src/lib/vacating/approvalPreview';
import { bedAvailableCalendarDate } from '@/src/lib/vacating/vacatingBedSemantics';

export type AdminMoveOutFinancialSummary = {
  securityDepositPaise: number;
  /** Gross unused prepaid rent (before notice). */
  unusedPrepaidRentPaise: number | null;
  noticeDeductionPaise: number;
  /** Unused prepaid after notice — same as resident net wallet credit. */
  netUnusedRentWalletCreditPaise: number | null;
  electricityDeductionPaise: number;
  electricityPending: boolean;
  estimatedRefundPaise: number;
  bedAvailableFrom: string;
};

/** Admin Operations card — same refund lines as resident SSOT settlement preview. */
export function resolveAdminMoveOutFinancialSummary(
  row: MoveOutPipelineItemClient,
  preview?: VacatingApprovalPreview | null,
): AdminMoveOutFinancialSummary {
  const bedAvailableFrom = bedAvailableCalendarDate(row.vacatingDate);

  if (preview?.estimatedSettlement) {
    const waterfall = preview.estimatedSettlement.waterfall;
    const refund = buildResidentMoveOutRefundSummary(waterfall, { isEstimate: true });
    return {
      securityDepositPaise: refund.securityDepositPaise,
      unusedPrepaidRentPaise: refund.unusedPrepaidRentPaise,
      noticeDeductionPaise: refund.noticeDeductionPaise,
      netUnusedRentWalletCreditPaise: refund.netUnusedRentWalletCreditPaise,
      electricityDeductionPaise: refund.electricityDeductionPaise,
      electricityPending: refund.electricityPending === true,
      estimatedRefundPaise: refund.estimatedRefundPaise,
      bedAvailableFrom,
    };
  }

  return {
    securityDepositPaise: row.depositHeldPaise,
    unusedPrepaidRentPaise: null,
    noticeDeductionPaise: row.deductionPaise,
    netUnusedRentWalletCreditPaise: null,
    electricityDeductionPaise: row.electricityDeductionPaise,
    electricityPending: row.electricityDeductionPaise === 0,
    estimatedRefundPaise: row.estimatedRefundPaise,
    bedAvailableFrom,
  };
}

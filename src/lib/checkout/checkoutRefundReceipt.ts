import { paiseToInr } from '@/src/lib/format';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

export type CheckoutRefundReceiptData = {
  settlementId: string;
  residentName: string;
  bookingCode: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  depositPaise: number;
  noticeDeductionPaise: number;
  electricityDeductionPaise: number;
  damagePaise: number;
  otherDeductionsPaise: number;
  finalRefundPaise: number;
  refundReference: string | null;
  completedAt: Date | string | null;
  completedByLabel: string | null;
  isComplete: boolean;
};

export function buildCheckoutRefundReceiptData(
  detail: CheckoutSettlementDetail,
  completedByLabel?: string | null,
): CheckoutRefundReceiptData {
  const preview = detail.preview;
  const isComplete =
    detail.status === 'completed' ||
    detail.status === 'refund_paid' ||
    (detail.amountsLocked && detail.preview.finalRefundPaise <= 0);

  return {
    settlementId: detail.id,
    residentName: detail.customerName,
    bookingCode: detail.bookingCode,
    pgName: detail.pgName,
    roomNumber: detail.roomNumber,
    bedCode: detail.bedCode,
    depositPaise: detail.depositRefundablePaise,
    noticeDeductionPaise: preview.noticeDeductionPaise,
    electricityDeductionPaise: preview.electricityDeductFromDeposit
      ? preview.electricityDeductionPaise
      : 0,
    damagePaise: preview.damageChargePaise ?? 0,
    otherDeductionsPaise:
      (preview.cleaningChargePaise ?? 0) + (preview.customChargePaise ?? 0),
    finalRefundPaise: preview.finalRefundPaise,
    refundReference:
      detail.refundReference && detail.refundReference !== 'confirmed-without-reference'
        ? detail.refundReference
        : null,
    completedAt: detail.refundPaidAt ?? detail.approvedAt,
    completedByLabel: completedByLabel ?? null,
    isComplete,
  };
}

export function formatReceiptDeduction(paise: number): string {
  if (paise <= 0) return '—';
  return `−${paiseToInr(paise)}`;
}
